-- 0012: Face grouping for end-of-trip photo albums (reference-only MVP).
-- Extends 0002 wm_media / wm_face_* with per-photo multi-face storage.
-- SFace embeddings are 128-d, L2-normalized. Cosine similarity = dot product.
-- All matching stays trip-scoped. Revocation deletes biometric rows, not history.

CREATE EXTENSION IF NOT EXISTS vector;

-- Private bucket for trip originals + derivatives. Service key bypasses RLS;
-- browsers never get direct bucket access, only short-lived signed URLs via Core.
INSERT INTO storage.buckets (id, name, public)
VALUES ('trip-media-private', 'trip-media-private', false)
ON CONFLICT (id) DO NOTHING;

-- One row per detected face in a trip photo (not just reference selfies).
CREATE TABLE IF NOT EXISTS wm_photo_faces (
  face_id text PRIMARY KEY,
  media_id text NOT NULL REFERENCES wm_media(media_id) ON DELETE CASCADE,
  trip_id text NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  bbox jsonb NOT NULL DEFAULT '{"x":0,"y":0,"w":0,"h":0}'::jsonb,
  embedding vector(128),
  model_version text NOT NULL DEFAULT 'sface-2024',
  detection_score numeric(5,4),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wm_photo_faces_media_idx ON wm_photo_faces(media_id);
CREATE INDEX IF NOT EXISTS wm_photo_faces_trip_idx ON wm_photo_faces(trip_id);

-- Reference identity per member per trip: centroid of 1..N consented selfies.
-- 0002 wm_face_references has no embedding column; add it additively.
ALTER TABLE wm_face_references
  ADD COLUMN IF NOT EXISTS embedding vector(128),
  ADD COLUMN IF NOT EXISTS model_version text NOT NULL DEFAULT 'sface-2024',
  ADD COLUMN IF NOT EXISTS face_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS wm_face_references_trip_subject_idx
  ON wm_face_references(trip_id, subject_user_id) WHERE revoked_at IS NULL;

-- Matches link a detected photo face to a reference identity.
-- 0002 wm_face_matches links media->reference; keep it, add face-level link.
ALTER TABLE wm_face_matches
  ADD COLUMN IF NOT EXISTS photo_face_id text REFERENCES wm_photo_faces(face_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subject_user_id text REFERENCES users(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS wm_face_matches_face_ref_idx
  ON wm_face_matches(photo_face_id, reference_id) WHERE photo_face_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wm_face_matches_trip_idx ON wm_face_matches(trip_id, review_state);

-- RLS + least privilege: only convia_command_owner touches these via functions.
ALTER TABLE wm_photo_faces ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='wm_photo_faces'
    AND policyname='convia_command_owner_access'
  ) THEN
    CREATE POLICY convia_command_owner_access ON wm_photo_faces
      TO convia_command_owner USING (true) WITH CHECK (true);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON wm_photo_faces TO convia_command_owner;

-- ---------------------------------------------------------------------------
-- wm_media_command: writes. All membership checks via wm_member_role.
-- Actions: media.upload | media.ready | face.reference.upsert | face.reference.revoke
--          | face.result.ingest (worker, via service token path in Core, not direct)
--          | face.match.correct
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wm_media_command(p_actor text, p_action text, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_trip text; v_role text; v_media text; v_ref text; v_job text; v_face text;
  v_emb vector(128); v_count int;
BEGIN
  p_input := coalesce(p_input, '{}'::jsonb);

  IF p_action = 'media.upload' THEN
    v_trip := p_input->>'trip_id';
    IF v_trip IS NULL OR wm_member_role(p_actor, v_trip) IS NULL THEN
      RAISE EXCEPTION 'MEMBERSHIP_REQUIRED';
    END IF;
    IF wm_member_role(p_actor, v_trip) = 'guest' THEN RAISE EXCEPTION 'DECISION_FORBIDDEN'; END IF;
    IF nullif(p_input->>'object_key','') IS NULL OR nullif(p_input->>'checksum','') IS NULL THEN
      RAISE EXCEPTION 'INVALID_MEDIA';
    END IF;
    -- Dedupe on checksum per trip: re-upload returns existing row, no duplicate job.
    SELECT media_id INTO v_media FROM wm_media
      WHERE trip_id = v_trip AND checksum = p_input->>'checksum' LIMIT 1;
    IF v_media IS NOT NULL THEN
      SELECT job_id INTO v_job FROM wm_media_jobs WHERE media_id = v_media LIMIT 1;
      RETURN jsonb_build_object('media_id', v_media, 'duplicate', true, 'job_id', v_job);
    END IF;
    v_media := 'med_' || replace(gen_random_uuid()::text,'-','');
    INSERT INTO wm_media(media_id, trip_id, uploader_user_id, object_key, checksum,
        content_type, byte_size, status, consent_context)
      VALUES (v_media, v_trip, p_actor, p_input->>'object_key', p_input->>'checksum',
        coalesce(p_input->>'content_type','image/jpeg'),
        coalesce((p_input->>'byte_size')::bigint, 0),
        'pending',
        coalesce(p_input->'consent_context', '{"face_grouping":true}'::jsonb));
    v_job := 'job_' || replace(gen_random_uuid()::text,'-','');
    INSERT INTO wm_jobs(job_id, queue, job_type, payload_version, payload, dedupe_key, state)
      VALUES (v_job, 'media', coalesce(p_input->>'job_kind','photo_process'), 1,
        jsonb_build_object('media_id', v_media, 'trip_id', v_trip,
          'object_key', p_input->>'object_key',
          'kind', coalesce(p_input->>'job_kind','photo_process')),
        'media:' || v_media || ':' || coalesce(p_input->>'job_kind','photo_process'),
        'queued')
      ON CONFLICT (dedupe_key) DO NOTHING;
    SELECT job_id INTO v_job FROM wm_jobs WHERE dedupe_key =
      'media:' || v_media || ':' || coalesce(p_input->>'job_kind','photo_process');
    INSERT INTO wm_media_jobs(media_job_id, media_id, job_id, kind)
      VALUES ('mj_' || replace(gen_random_uuid()::text,'-',''), v_media, v_job,
        coalesce(p_input->>'job_kind','photo_process'))
      ON CONFLICT DO NOTHING;
    PERFORM wm_emit(v_trip, 'media.uploaded', v_media);
    RETURN jsonb_build_object('media_id', v_media, 'job_id', v_job, 'duplicate', false);

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
    -- p_input: trip_id, embedding float[128], model_version. Subject defaults to actor.
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
      -- Reference selfies still go through wm_media for auditability; caller passes media_id.
      INSERT INTO wm_face_references(reference_id, trip_id, subject_user_id, media_id,
          consented_at, embedding, model_version, face_count)
        VALUES (v_ref, v_trip, p_actor, p_input->>'media_id', now(), v_emb,
          coalesce(p_input->>'model_version','sface-2024'), 1);
    ELSE
      -- Running centroid: average old centroid * n + new sample, renormalized in app;
      -- here store plain mean, renormalize on read (dot product needs unit vectors,
      -- so Core normalizes before compare; small drift acceptable for MVP).
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
    -- Derived matches for revoked identity are removed; decision history untouched.
    DELETE FROM wm_face_matches m USING wm_face_references r
      WHERE m.reference_id=r.reference_id AND r.trip_id=v_trip AND r.subject_user_id=p_actor;
    PERFORM wm_emit(v_trip, 'face.reference_revoked', p_actor);
    RETURN jsonb_build_object('revoked', true);

  ELSIF p_action = 'face.match.correct' THEN
    -- p_input: photo_face_id, subject_user_id | null (null = not this person).
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

-- ---------------------------------------------------------------------------
-- wm_media_query: reads, trip-scoped. No embeddings leave Core except as
-- matched photo lists; raw vectors never go to the browser.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wm_media_query(p_actor text, p_action text, p_resource text, p_filter jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb; v_role text;
BEGIN
  p_filter := coalesce(p_filter, '{}'::jsonb);
  IF p_action = 'media.job_status' THEN
    SELECT jsonb_build_object('job_id', j.job_id, 'state', j.state, 'attempts', j.attempts,
        'result_reference', j.result_reference, 'media_id', mj.media_id)
      INTO v_result FROM wm_jobs j JOIN wm_media_jobs mj USING(job_id)
      WHERE j.job_id = p_resource;
    RETURN v_result;
  END IF;

  v_role := wm_member_role(p_actor, p_resource);
  IF v_role IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED'; END IF;

  IF p_action = 'media.list' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'media_id', m.media_id, 'status', m.status, 'content_type', m.content_type,
        'byte_size', m.byte_size, 'created_at', m.created_at,
        'face_count', coalesce(f.n, 0)) ORDER BY m.created_at DESC), '[]'::jsonb)
      INTO v_result FROM wm_media m
      LEFT JOIN (SELECT media_id, count(*) n FROM wm_photo_faces GROUP BY media_id) f USING(media_id)
      WHERE m.trip_id = p_resource;
    RETURN v_result;

  ELSIF p_action = 'face.references.list' THEN
    -- join on subject_user_id: reference identity -> user display name.
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'reference_id', r.reference_id, 'subject_user_id', r.subject_user_id,
        'display_name', u.display_name, 'face_count', r.face_count,
        'model_version', r.model_version, 'updated_at', r.updated_at)
        ORDER BY r.updated_at DESC), '[]'::jsonb)
      INTO v_result FROM wm_face_references r JOIN users u ON u.user_id = r.subject_user_id
      WHERE r.trip_id = p_resource AND r.revoked_at IS NULL;
    RETURN v_result;

  ELSIF p_action = 'face.people' THEN
    -- People strip: each enrolled member + photo counts (one photo can count for many people).
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'subject_user_id', r.subject_user_id, 'display_name', u.display_name,
        'photo_count', coalesce(c.n, 0)) ORDER BY coalesce(c.n,0) DESC), '[]'::jsonb)
      INTO v_result
      FROM wm_face_references r JOIN users u ON u.user_id = r.subject_user_id
      LEFT JOIN (SELECT reference_id, count(DISTINCT media_id)::int n FROM wm_face_matches
                 WHERE trip_id = p_resource AND review_state != 'rejected' GROUP BY reference_id) c
        ON c.reference_id = r.reference_id
      WHERE r.trip_id = p_resource AND r.revoked_at IS NULL;
    RETURN v_result;

  ELSIF p_action = 'face.photos_for_person' THEN
    SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
        'media_id', m.media_id, 'confidence', mt.confidence,
        'review_state', mt.review_state, 'created_at', m.created_at)
        ORDER BY m.created_at DESC), '[]'::jsonb)
      INTO v_result FROM wm_face_matches mt JOIN wm_media m USING(media_id)
      WHERE mt.trip_id = p_resource
        AND mt.subject_user_id = (p_filter->>'subject_user_id')
        AND mt.review_state != 'rejected';
    RETURN coalesce(v_result, '[]'::jsonb);

  ELSIF p_action = 'face.unassigned' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'media_id', m.media_id, 'face_id', f.face_id, 'created_at', m.created_at)
        ORDER BY m.created_at DESC), '[]'::jsonb)
      INTO v_result FROM wm_photo_faces f JOIN wm_media m USING(media_id)
      WHERE f.trip_id = p_resource
        AND NOT EXISTS (SELECT 1 FROM wm_face_matches mt
          WHERE mt.photo_face_id = f.face_id AND mt.review_state != 'rejected');
    RETURN coalesce(v_result, '[]'::jsonb);
  END IF;

  RAISE EXCEPTION 'UNKNOWN_QUERY';
END $$;

ALTER FUNCTION wm_media_command(text,text,jsonb) OWNER TO convia_command_owner;
ALTER FUNCTION wm_media_query(text,text,text,jsonb) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_media_command(text,text,jsonb), wm_media_query(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_media_command(text,text,jsonb), wm_media_query(text,text,text,jsonb) TO convia_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON wm_photo_faces TO convia_command_owner;
