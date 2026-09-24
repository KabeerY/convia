-- 0015: resolve a media object's storage key after membership check, so Core
-- can mint short-lived signed URLs without exposing keys or embeddings.

CREATE OR REPLACE FUNCTION wm_media_object(p_actor text, p_media text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row wm_media%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM wm_media WHERE media_id = p_media;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF wm_member_role(p_actor, v_row.trip_id) IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_REQUIRED';
  END IF;
  RETURN jsonb_build_object('media_id', v_row.media_id, 'trip_id', v_row.trip_id,
    'object_key', v_row.object_key, 'content_type', v_row.content_type,
    'status', v_row.status);
END $$;

ALTER FUNCTION wm_media_object(text,text) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_media_object(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_media_object(text,text) TO convia_runtime;
