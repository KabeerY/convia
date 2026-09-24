-- 0019: reuse identical trip photos without conflating album and reference jobs.
-- One stored image can be processed for more than one purpose, for example
-- when a photo was first added to the album and later chosen as a selfie.
CREATE OR REPLACE FUNCTION wm_media_command(p_actor text, p_action text, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_trip text; v_role text; v_media text; v_ref text; v_job text; v_face text;
  v_emb vector(128); v_count int; v_kind text; v_object_key text; v_dedupe_key text;
BEGIN
  p_input := coalesce(p_input, '{}'::jsonb);

  IF p_action = 'media.upload' THEN
    v_trip := p_input->>'trip_id';
    v_kind := coalesce(p_input->>'job_kind','photo_process');
    IF v_trip IS NULL OR wm_member_role(p_actor, v_trip) IS NULL THEN
      RAISE EXCEPTION 'MEMBERSHIP_REQUIRED';
    END IF;
    IF wm_member_role(p_actor, v_trip) = 'guest' THEN RAISE EXCEPTION 'DECISION_FORBIDDEN'; END IF;
    IF v_kind NOT IN ('photo_process', 'reference_enroll') THEN RAISE EXCEPTION 'INVALID_MEDIA_JOB_KIND'; END IF;
    IF nullif(p_input->>'object_key','') IS NULL OR nullif(p_input->>'checksum','') IS NULL THEN
      RAISE EXCEPTION 'INVALID_MEDIA';
    END IF;

    -- A checksum can have one job of each kind. A photo job must never stand
    -- in for a reference enrollment job (or vice versa).
    SELECT media_id, object_key INTO v_media, v_object_key FROM wm_media
      WHERE trip_id = v_trip AND checksum = p_input->>'checksum' LIMIT 1;
    IF v_media IS NOT NULL THEN
      SELECT j.job_id INTO v_job
        FROM wm_media_jobs mj JOIN wm_jobs j USING (job_id)
        WHERE mj.media_id = v_media AND mj.kind = v_kind
          AND (v_kind <> 'reference_enroll' OR j.payload->>'subject_user_id' = p_actor)
        ORDER BY mj.created_at DESC LIMIT 1;
      IF v_job IS NOT NULL THEN
        RETURN jsonb_build_object('media_id', v_media, 'duplicate', true,
          'job_id', v_job, 'job_kind', v_kind);
      END IF;

      v_job := 'job_' || replace(gen_random_uuid()::text,'-','');
      v_dedupe_key := 'media:' || v_media || ':' || v_kind ||
        CASE WHEN v_kind = 'reference_enroll' THEN ':' || p_actor ELSE '' END;
      INSERT INTO wm_jobs(job_id, queue, job_type, payload_version, payload, dedupe_key, state)
        VALUES (v_job, 'media', v_kind, 1,
          jsonb_build_object('media_id', v_media, 'trip_id', v_trip,
            'object_key', v_object_key, 'kind', v_kind,
            'subject_user_id', p_actor),
          v_dedupe_key, 'queued')
        ON CONFLICT (dedupe_key) DO NOTHING;
      SELECT job_id INTO v_job FROM wm_jobs WHERE dedupe_key = v_dedupe_key;
      INSERT INTO wm_media_jobs(media_job_id, media_id, job_id, kind)
        VALUES ('mj_' || replace(gen_random_uuid()::text,'-',''), v_media, v_job, v_kind)
        ON CONFLICT DO NOTHING;
      RETURN jsonb_build_object('media_id', v_media, 'job_id', v_job,
        'job_kind', v_kind, 'duplicate', false, 'reused_media', true);
    END IF;

    v_media := 'med_' || replace(gen_random_uuid()::text,'-','');
    INSERT INTO wm_media(media_id, trip_id, uploader_user_id, object_key, checksum,
        content_type, byte_size, status, consent_context)
      VALUES (v_media, v_trip, p_actor, p_input->>'object_key', p_input->>'checksum',
        coalesce(p_input->>'content_type','image/jpeg'),
        coalesce((p_input->>'byte_size')::bigint, 0), 'pending',
        coalesce(p_input->'consent_context', '{"face_grouping":true}'::jsonb));
    v_job := 'job_' || replace(gen_random_uuid()::text,'-','');
    v_dedupe_key := 'media:' || v_media || ':' || v_kind ||
      CASE WHEN v_kind = 'reference_enroll' THEN ':' || p_actor ELSE '' END;
    INSERT INTO wm_jobs(job_id, queue, job_type, payload_version, payload, dedupe_key, state)
      VALUES (v_job, 'media', v_kind, 1,
        jsonb_build_object('media_id', v_media, 'trip_id', v_trip,
          'object_key', p_input->>'object_key', 'kind', v_kind,
          'subject_user_id', p_actor),
        v_dedupe_key, 'queued')
      ON CONFLICT (dedupe_key) DO NOTHING;
    SELECT job_id INTO v_job FROM wm_jobs WHERE dedupe_key = v_dedupe_key;
    INSERT INTO wm_media_jobs(media_job_id, media_id, job_id, kind)
      VALUES ('mj_' || replace(gen_random_uuid()::text,'-',''), v_media, v_job, v_kind)
      ON CONFLICT DO NOTHING;
    PERFORM wm_emit(v_trip, 'media.uploaded', v_media);
    RETURN jsonb_build_object('media_id', v_media, 'job_id', v_job,
      'job_kind', v_kind, 'duplicate', false);

  ELSIF p_action = 'media.ready' THEN
    v_media := p_input->>'media_id';
    SELECT trip_id INTO v_trip FROM wm_media WHERE media_id = v_media;
    IF v_trip IS NULL OR wm_member_role(p_actor, v_trip) IS NULL THEN
      RAISE EXCEPTION 'MEMBERSHIP_REQUIRED';
    END IF;
    UPDATE wm_media SET status='ready', updated_at=now() WHERE media_id=v_media;
    PERFORM wm_emit(v_trip, 'media.processed', v_media);
    RETURN jsonb_build_object('media_id', v_media, 'status', 'ready');

  ELSIF p_action = 'face.reference.upsert' THEN
    v_trip := p_input->>'trip_id';
    IF v_trip IS NULL OR wm_member_role(p_actor, v_trip) IS NULL THEN
      RAISE EXCEPTION 'MEMBERSHIP_REQUIRED';
    END IF;
    IF jsonb_typeof(p_input->'embedding') != 'array'
       OR jsonb_array_length(p_input->'embedding') != 128 THEN
      RAISE EXCEPTION 'INVALID_EMBEDDING';
    END IF;
    v_emb := (p_input->>'embedding')::vector(128);
    SELECT reference_id INTO v_ref FROM wm_face_references
      WHERE trip_id=v_trip AND subject_user_id=p_actor AND revoked_at IS NULL;
    IF v_ref IS NULL THEN
      v_ref := 'ref_' || replace(gen_random_uuid()::text,'-','');
      INSERT INTO wm_face_references(reference_id, trip_id, subject_user_id, media_id,
          consented_at, embedding, model_version, face_count)
        VALUES (v_ref, v_trip, p_actor, p_input->>'media_id', now(), v_emb,
          coalesce(p_input->>'model_version','sface-2024'), 1);
    ELSE
      UPDATE wm_face_references SET
        embedding = ((embedding::text::vector(128) * face_count + v_emb) / (face_count + 1))::vector(128),
        face_count = face_count + 1,
        updated_at = now()
        WHERE reference_id = v_ref;
    END IF;
    PERFORM wm_emit(v_trip, 'face.reference_updated', v_ref);
    RETURN jsonb_build_object('reference_id', v_ref);

  ELSIF p_action = 'face.reference.revoke' THEN
    v_trip := p_input->>'trip_id';
    IF v_trip IS NULL OR wm_member_role(p_actor, v_trip) IS NULL THEN
      RAISE EXCEPTION 'MEMBERSHIP_REQUIRED';
    END IF;
    UPDATE wm_face_references SET revoked_at=now(), embedding=NULL, updated_at=now()
      WHERE trip_id=v_trip AND subject_user_id=p_actor AND revoked_at IS NULL;
    DELETE FROM wm_face_matches m USING wm_face_references r
      WHERE m.reference_id=r.reference_id AND r.trip_id=v_trip AND r.subject_user_id=p_actor;
    PERFORM wm_emit(v_trip, 'face.reference_revoked', p_actor);
    RETURN jsonb_build_object('revoked', true);

  ELSIF p_action = 'face.match.correct' THEN
    SELECT trip_id INTO v_trip FROM wm_photo_faces WHERE face_id = p_input->>'photo_face_id';
    IF v_trip IS NULL OR wm_member_role(p_actor, v_trip) IS NULL THEN
      RAISE EXCEPTION 'MEMBERSHIP_REQUIRED';
    END IF;
    IF (p_input->>'subject_user_id') IS NULL THEN
      UPDATE wm_face_matches SET review_state='rejected', updated_at=now()
        WHERE photo_face_id = p_input->>'photo_face_id';
      RETURN jsonb_build_object('photo_face_id', p_input->>'photo_face_id', 'review_state', 'rejected');
    END IF;
    SELECT reference_id INTO v_ref FROM wm_face_references
      WHERE trip_id=v_trip AND subject_user_id=p_input->>'subject_user_id' AND revoked_at IS NULL;
    IF v_ref IS NULL THEN RAISE EXCEPTION 'REFERENCE_NOT_FOUND'; END IF;
    INSERT INTO wm_face_matches(match_id, trip_id, media_id, reference_id, photo_face_id,
        subject_user_id, confidence, review_state)
      SELECT 'mat_' || replace(gen_random_uuid()::text,'-',''), v_trip, f.media_id, v_ref,
        f.face_id, p_input->>'subject_user_id', 1.0, 'confirmed'
        FROM wm_photo_faces f WHERE f.face_id = p_input->>'photo_face_id'
      ON CONFLICT DO NOTHING;
    UPDATE wm_face_matches SET review_state='confirmed', confidence=1.0, updated_at=now()
      WHERE photo_face_id=p_input->>'photo_face_id' AND reference_id=v_ref;
    RETURN jsonb_build_object('photo_face_id', p_input->>'photo_face_id', 'review_state', 'confirmed');
  END IF;

  RAISE EXCEPTION 'UNKNOWN_COMMAND';
END $$;

ALTER FUNCTION wm_media_command(text,text,jsonb) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_media_command(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_media_command(text,text,jsonb) TO convia_runtime;
