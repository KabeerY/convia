-- 0014: expose the media uploader to the worker so reference selfies can be
-- attributed to the correct subject without trusting worker-supplied identity
-- alone (claim comes from Core; ingest subject must match for enroll jobs,
-- enforced in the Core HTTP layer, not SQL).

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
        'object_key', v_media.object_key, 'checksum', v_media.checksum,
        'uploader_user_id', v_media.uploader_user_id) END);
END $$;

ALTER FUNCTION wm_media_job_claim(text) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_media_job_claim(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_media_job_claim(text) TO convia_runtime;
