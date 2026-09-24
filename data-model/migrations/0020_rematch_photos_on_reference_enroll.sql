-- 0020: when a member enrolls a reference after album photos have already
-- been processed, compare the existing trip faces against the new references.
-- Keep manual decisions intact; only regenerate automatic candidates.
CREATE OR REPLACE FUNCTION wm_media_ingest(p_actor text, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_trip text; v_media text; v_kind text; v_subject text; v_model text; v_thresh float;
  v_face jsonb; v_emb vector(128); v_face_id text; v_ref text; v_best_ref text;
  v_best_sub text; v_best_score float; v_n int := 0; v_m int := 0;
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

    -- Existing automatic guesses may have been made against an older set of
    -- references. Rebuild them against the current trip references, but never
    -- overwrite a member's confirmed or rejected review decision.
    DELETE FROM wm_face_matches candidate
      WHERE candidate.trip_id = v_trip AND candidate.review_state = 'candidate'
        AND NOT EXISTS (
          SELECT 1 FROM wm_face_matches reviewed
          WHERE reviewed.photo_face_id = candidate.photo_face_id
            AND reviewed.review_state IN ('confirmed', 'rejected')
        );

    INSERT INTO wm_face_matches(match_id, trip_id, media_id, reference_id, photo_face_id,
        subject_user_id, confidence, review_state)
    SELECT 'mat_' || replace(gen_random_uuid()::text,'-',''), best.trip_id, best.media_id,
        best.reference_id, best.face_id, best.subject_user_id, best.score, 'candidate'
    FROM (
      SELECT f.face_id, f.trip_id, f.media_id, candidate.reference_id,
          candidate.subject_user_id, candidate.score
      FROM wm_photo_faces f
      CROSS JOIN LATERAL (
        SELECT r.reference_id, r.subject_user_id,
          (-(r.embedding <#> f.embedding) /
            (greatest(sqrt(-(r.embedding <#> r.embedding)), 1e-9) *
             greatest(sqrt(-(f.embedding <#> f.embedding)), 1e-9)))::float AS score
        FROM wm_face_references r
        WHERE r.trip_id = v_trip AND r.revoked_at IS NULL AND r.embedding IS NOT NULL
          AND r.model_version = f.model_version
        ORDER BY (-(r.embedding <#> f.embedding) /
          (greatest(sqrt(-(r.embedding <#> r.embedding)), 1e-9) *
           greatest(sqrt(-(f.embedding <#> f.embedding)), 1e-9))) DESC
        LIMIT 1
      ) candidate
      WHERE f.trip_id = v_trip AND f.model_version = v_model
        AND candidate.score >= v_thresh
        AND NOT EXISTS (
          SELECT 1 FROM wm_face_matches reviewed
          WHERE reviewed.photo_face_id = f.face_id
            AND reviewed.review_state IN ('confirmed', 'rejected')
        )
    ) best;
    GET DIAGNOSTICS v_m = ROW_COUNT;

    UPDATE wm_media SET status='ready', updated_at=now() WHERE media_id=v_media;
    PERFORM wm_emit(v_trip, 'face.reference_updated', v_ref);
    RETURN jsonb_build_object('reference_id', v_ref, 'faces', 1, 'rematched', v_m);
  END IF;

  -- Trip photos: store every face, then match each against the closest active
  -- reference in the same trip.
  FOR v_face IN SELECT * FROM jsonb_array_elements(p_input->'faces') LOOP
    IF jsonb_array_length(v_face->'embedding') != 128 THEN CONTINUE; END IF;
    v_emb := (v_face->>'embedding')::vector(128);
    v_face_id := 'fce_' || replace(gen_random_uuid()::text,'-','');
    INSERT INTO wm_photo_faces(face_id, media_id, trip_id, bbox, embedding, model_version, detection_score)
      VALUES (v_face_id, v_media, v_trip, coalesce(v_face->'bbox','{}'::jsonb), v_emb, v_model,
        nullif((v_face->>'detection_score'),'')::numeric);
    v_n := v_n + 1;
    SELECT r.reference_id, r.subject_user_id,
      (-(r.embedding <#> v_emb) /
        (greatest(sqrt(-(r.embedding <#> r.embedding)), 1e-9) *
         greatest(sqrt(-(v_emb <#> v_emb)), 1e-9)))::float
      INTO v_best_ref, v_best_sub, v_best_score
      FROM wm_face_references r
      WHERE r.trip_id = v_trip AND r.revoked_at IS NULL AND r.embedding IS NOT NULL
        AND r.model_version = v_model
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

ALTER FUNCTION wm_media_ingest(text,jsonb) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_media_ingest(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_media_ingest(text,jsonb) TO convia_runtime;

-- Repair trips that already have both references and processed photos. This
-- uses the same default cosine threshold as the Core API and only rebuilds
-- unreviewed candidates; confirmed/rejected user decisions are left untouched.
DELETE FROM wm_face_matches candidate
  WHERE candidate.review_state = 'candidate'
    AND NOT EXISTS (
      SELECT 1 FROM wm_face_matches reviewed
      WHERE reviewed.photo_face_id = candidate.photo_face_id
        AND reviewed.review_state IN ('confirmed', 'rejected')
    );

INSERT INTO wm_face_matches(match_id, trip_id, media_id, reference_id, photo_face_id,
    subject_user_id, confidence, review_state)
SELECT 'mat_' || replace(gen_random_uuid()::text,'-',''), best.trip_id, best.media_id,
    best.reference_id, best.face_id, best.subject_user_id, best.score, 'candidate'
FROM (
  SELECT f.face_id, f.trip_id, f.media_id, candidate.reference_id,
      candidate.subject_user_id, candidate.score
  FROM wm_photo_faces f
  CROSS JOIN LATERAL (
    SELECT r.reference_id, r.subject_user_id,
      (-(r.embedding <#> f.embedding) /
        (greatest(sqrt(-(r.embedding <#> r.embedding)), 1e-9) *
         greatest(sqrt(-(f.embedding <#> f.embedding)), 1e-9)))::float AS score
    FROM wm_face_references r
    WHERE r.trip_id = f.trip_id AND r.revoked_at IS NULL AND r.embedding IS NOT NULL
      AND r.model_version = f.model_version
    ORDER BY (-(r.embedding <#> f.embedding) /
      (greatest(sqrt(-(r.embedding <#> r.embedding)), 1e-9) *
       greatest(sqrt(-(f.embedding <#> f.embedding)), 1e-9))) DESC
    LIMIT 1
  ) candidate
  WHERE candidate.score >= 0.5
    AND NOT EXISTS (
      SELECT 1 FROM wm_face_matches reviewed
      WHERE reviewed.photo_face_id = f.face_id
        AND reviewed.review_state IN ('confirmed', 'rejected')
    )
) best;
