-- 0018: expose photo_face_id in face.photos_for_person so the UI can offer
-- per-face correction ("not Kabir") without an extra lookup.

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
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'reference_id', r.reference_id, 'subject_user_id', r.subject_user_id,
        'display_name', u.display_name, 'face_count', r.face_count,
        'model_version', r.model_version, 'updated_at', r.updated_at)
        ORDER BY r.updated_at DESC), '[]'::jsonb)
      INTO v_result FROM wm_face_references r JOIN users u ON u.user_id = r.subject_user_id
      WHERE r.trip_id = p_resource AND r.revoked_at IS NULL;
    RETURN v_result;

  ELSIF p_action = 'face.people' THEN
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
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'media_id', m.media_id, 'face_id', mt.photo_face_id,
        'confidence', mt.confidence,
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

ALTER FUNCTION wm_media_query(text,text,text,jsonb) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_media_query(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_media_query(text,text,text,jsonb) TO convia_runtime;
