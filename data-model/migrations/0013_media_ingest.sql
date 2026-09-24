-- 0013: worker ingest + job lease for the face pipeline.
-- Called only from Core's internal endpoints (MEDIA_SERVICE_TOKEN checked in HTTP).
-- Trip scope is rechecked here: media.trip_id must equal the claimed trip.

CREATE OR REPLACE FUNCTION wm_media_job_claim(p_owner text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_job wm_jobs%ROWTYPE; v_media wm_media%ROWTYPE;
BEGIN
  SELECT j.* INTO v_job FROM wm_jobs j
    WHERE j.queue = 'media' AND j.state IN ('queued', 'retry_wait')
      AND (j.next_retry_at IS NULL OR j.next_retry_at <= now())
    ORDER BY j.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE wm_jobs SET state='running', lease_owner=p_owner,
      lease_expires_at = now() + make_interval(secs => coalesce((current_setting('convia.job_lease_seconds', true))::int, 60)),
      lease_generation = lease_generation + 1, attempts = attempts + 1, updated_at = now()
    WHERE job_id = v_job.job_id RETURNING * INTO v_job;
  SELECT * INTO v_media FROM wm_media WHERE media_id = (v_job.payload->>'media_id');
  RETURN jsonb_build_object(
    'job_id', v_job.job_id, 'job_type', v_job.job_type,
    'lease_generation', v_job.lease_generation,
    'lease_expires_at', v_job.lease_expires_at,
    'payload', v_job.payload,
    'media', CASE WHEN v_media.media_id IS NULL THEN NULL
      ELSE jsonb_build_object('media_id', v_media.media_id, 'trip_id', v_media.trip_id,
        'object_key', v_media.object_key, 'checksum', v_media.checksum) END);
END $$;

CREATE OR REPLACE FUNCTION wm_media_job_complete(p_owner text, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_job wm_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM wm_jobs WHERE job_id = p_input->>'job_id' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;
  IF v_job.lease_owner IS DISTINCT FROM p_owner
     OR v_job.lease_expires_at IS NULL OR v_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'LEASE_EXPIRED';
  END IF;
  IF coalesce(p_input->>'success','true') = 'true' THEN
    UPDATE wm_jobs SET state='succeeded', result_reference = p_input->>'result_reference',
      lease_owner=NULL, lease_expires_at=NULL, updated_at=now() WHERE job_id=v_job.job_id;
  ELSE
    UPDATE wm_jobs SET state=CASE WHEN attempts >= 5 THEN 'failed' ELSE 'retry_wait' END,
      next_retry_at = now() + make_interval(secs => 30 * attempts),
      result_reference = left(coalesce(p_input->>'error','worker_failed'), 500),
      lease_owner=NULL, lease_expires_at=NULL, updated_at=now() WHERE job_id=v_job.job_id;
  END IF;
  RETURN jsonb_build_object('job_id', v_job.job_id, 'state',
    (SELECT state FROM wm_jobs WHERE job_id = v_job.job_id));
END $$;

-- Ingest worker results. p_input:
-- { trip_id, media_id, kind: photo_process|reference_enroll, subject_user_id?,
--   model_version, threshold?, faces: [{bbox:{x,y,w,h}, embedding:[128], detection_score?}] }
CREATE OR REPLACE FUNCTION wm_media_ingest(p_actor text, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_trip text; v_media text; v_kind text; v_subject text; v_model text; v_thresh float;
  v_face jsonb; v_emb vector(128); v_face_id text; v_ref text; v_best_ref text;
  v_best_sub text; v_best_score float; v_n int := 0; v_m int := 0; v_sim float;
BEGIN
  v_trip := p_input->>'trip_id'; v_media := p_input->>'media_id';
  v_kind := coalesce(p_input->>'kind','photo_process');
  v_model := coalesce(p_input->>'model_version','sface-2024');
  v_thresh := coalesce((p_input->>'threshold')::float, 0.5);
  IF v_trip IS NULL OR v_media IS NULL THEN RAISE EXCEPTION 'TRIP_MEDIA_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM wm_media WHERE media_id=v_media AND trip_id=v_trip) THEN
    RAISE EXCEPTION 'TRIP_MEDIA_MISMATCH';
  END IF;
  IF jsonb_typeof(p_input->'faces') != 'array' THEN RAISE EXCEPTION 'FACES_REQUIRED'; END IF;

  -- Reference enrollment: exactly one face becomes (or refines) the member centroid.
  IF v_kind = 'reference_enroll' THEN
    IF jsonb_array_length(p_input->'faces') != 1 THEN RAISE EXCEPTION 'REFERENCE_SINGLE_FACE'; END IF;
    v_face := (p_input->'faces')->0;
    IF jsonb_array_length(v_face->'embedding') != 128 THEN RAISE EXCEPTION 'INVALID_EMBEDDING'; END IF;
    v_emb := (v_face->>'embedding')::vector(128);
    v_subject := coalesce(p_input->>'subject_user_id', p_actor);
    SELECT reference_id INTO v_ref FROM wm_face_references
      WHERE trip_id=v_trip AND subject_user_id=v_subject AND revoked_at IS NULL;
    IF v_ref IS NULL THEN
      v_ref := 'ref_' || replace(gen_random_uuid()::text,'-','');
      INSERT INTO wm_face_references(reference_id, trip_id, subject_user_id, media_id,
          consented_at, embedding, model_version, face_count)
        VALUES (v_ref, v_trip, v_subject, v_media, now(), v_emb, v_model, 1);
    ELSE
      UPDATE wm_face_references SET
        embedding = ((embedding::text::vector(128) * face_count + v_emb) / (face_count + 1))::vector(128),
        face_count = face_count + 1, media_id = v_media, updated_at = now()
        WHERE reference_id = v_ref;
    END IF;
    UPDATE wm_media SET status='ready', updated_at=now() WHERE media_id=v_media;
    PERFORM wm_emit(v_trip, 'face.reference_updated', v_ref);
    RETURN jsonb_build_object('reference_id', v_ref, 'faces', 1);
  END IF;

  -- Trip photos: store every face, match against enrolled references in the SAME trip.
  FOR v_face IN SELECT * FROM jsonb_array_elements(p_input->'faces') LOOP
    IF jsonb_array_length(v_face->'embedding') != 128 THEN CONTINUE; END IF;
    v_emb := (v_face->>'embedding')::vector(128);
    v_face_id := 'fce_' || replace(gen_random_uuid()::text,'-','');
    INSERT INTO wm_photo_faces(face_id, media_id, trip_id, bbox, embedding, model_version, detection_score)
      VALUES (v_face_id, v_media, v_trip, coalesce(v_face->'bbox','{}'::jsonb), v_emb, v_model,
        nullif((v_face->>'detection_score'),'')::numeric);
    v_n := v_n + 1;
    -- Cosine similarity with per-vector normalization (robust to non-unit centroids).
    -- Order by the same normalized score so best-pick and threshold agree.
    SELECT r.reference_id, r.subject_user_id,
      (-(r.embedding <#> v_emb) /
        (greatest(sqrt(-(r.embedding <#> r.embedding)), 1e-9) *
         greatest(sqrt(-(v_emb <#> v_emb)), 1e-9)))::float
      INTO v_best_ref, v_best_sub, v_best_score
      FROM wm_face_references r
      WHERE r.trip_id = v_trip AND r.revoked_at IS NULL AND r.embedding IS NOT NULL
      ORDER BY (-(r.embedding <#> v_emb) /
        (greatest(sqrt(-(r.embedding <#> r.embedding)), 1e-9) *
         greatest(sqrt(-(v_emb <#> v_emb)), 1e-9))) DESC LIMIT 1;
    IF v_best_ref IS NOT NULL AND v_best_score >= v_thresh THEN
      INSERT INTO wm_face_matches(match_id, trip_id, media_id, reference_id, photo_face_id,
          subject_user_id, confidence, review_state)
        VALUES ('mat_' || replace(gen_random_uuid()::text,'-',''), v_trip, v_media,
          v_best_ref, v_face_id, v_best_sub, v_best_score, 'candidate')
        ON CONFLICT DO NOTHING;
      v_m := v_m + 1;
    END IF;
  END LOOP;
  UPDATE wm_media SET status='ready', updated_at=now() WHERE media_id=v_media;
  PERFORM wm_emit(v_trip, 'media.processed', v_media);
  RETURN jsonb_build_object('media_id', v_media, 'faces', v_n, 'matched', v_m);
END $$;

ALTER FUNCTION wm_media_job_claim(text) OWNER TO convia_command_owner;
ALTER FUNCTION wm_media_job_complete(text,jsonb) OWNER TO convia_command_owner;
ALTER FUNCTION wm_media_ingest(text,jsonb) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_media_job_claim(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION wm_media_job_complete(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION wm_media_ingest(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_media_job_claim(text), wm_media_job_complete(text,jsonb),
  wm_media_ingest(text,jsonb) TO convia_runtime;
