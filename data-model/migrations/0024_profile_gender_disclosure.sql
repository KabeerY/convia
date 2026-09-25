-- Gender self-description and public women representation.
-- Required onboarding choice, separate global aggregate consent, private by default.
CREATE TABLE wm_profile_gender_disclosures (
  user_id text PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  gender_identity text NOT NULL CHECK (gender_identity IN ('woman','man','nonbinary','self_described','prefer_not_to_say')),
  self_description text CHECK (self_description IS NULL OR (length(self_description) BETWEEN 1 AND 80)),
  aggregate_publication boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (gender_identity = 'self_described' AND self_description IS NOT NULL AND length(btrim(self_description)) > 0)
    OR (gender_identity <> 'self_described' AND self_description IS NULL)
  ),
  CHECK (
    aggregate_publication = false OR gender_identity <> 'prefer_not_to_say'
  )
);

ALTER TABLE wm_profile_gender_disclosures ENABLE ROW LEVEL SECURITY;
CREATE POLICY convia_command_owner_access ON wm_profile_gender_disclosures TO convia_command_owner USING (true) WITH CHECK (true);
REVOKE ALL ON wm_profile_gender_disclosures FROM PUBLIC;
REVOKE ALL ON wm_profile_gender_disclosures FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON wm_profile_gender_disclosures TO convia_command_owner;

-- Replace the V0 command to store gender disclosure alongside Passport saves.
ALTER FUNCTION wm_v0_command(text,text,jsonb) RENAME TO wm_v0_command_before_gender;

CREATE FUNCTION wm_v0_command(p_actor text,p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_identity text; v_self text; v_consent boolean; v_row wm_profile_gender_disclosures%ROWTYPE;
BEGIN
  p_input := coalesce(p_input,'{}'::jsonb);
  IF p_action = 'v0.gender.save' THEN
    v_identity := lower(btrim(coalesce(p_input->>'gender_identity','')));
    v_self := nullif(btrim(coalesce(p_input->>'self_description','')), '');
    v_consent := coalesce((p_input->>'aggregate_publication')::boolean, false);
    IF v_identity NOT IN ('woman','man','nonbinary','self_described','prefer_not_to_say') THEN
      RAISE EXCEPTION 'INVALID_GENDER';
    END IF;
    IF v_identity = 'self_described' THEN
      IF v_self IS NULL THEN RAISE EXCEPTION 'INVALID_GENDER_SELF_DESCRIPTION'; END IF;
      IF length(v_self) > 80 THEN RAISE EXCEPTION 'INVALID_GENDER_SELF_DESCRIPTION'; END IF;
    ELSE
      IF v_self IS NOT NULL THEN RAISE EXCEPTION 'INVALID_GENDER_SELF_DESCRIPTION'; END IF;
    END IF;
    IF v_consent AND v_identity = 'prefer_not_to_say' THEN
      RAISE EXCEPTION 'GENDER_CONSENT_REQUIRED';
    END IF;
    -- Store trimmed self description or null.
    INSERT INTO wm_profile_gender_disclosures(user_id, gender_identity, self_description, aggregate_publication, revision, updated_at)
    VALUES (p_actor, v_identity, CASE WHEN v_identity='self_described' THEN v_self ELSE NULL END, v_consent, 1, now())
    ON CONFLICT (user_id) DO UPDATE SET
      gender_identity = EXCLUDED.gender_identity,
      self_description = EXCLUDED.self_description,
      aggregate_publication = EXCLUDED.aggregate_publication,
      revision = wm_profile_gender_disclosures.revision + 1,
      updated_at = now()
    RETURNING * INTO v_row;
    INSERT INTO wm_profile_field_state(user_id, field, source, confirmed, visibility, updated_at)
    VALUES (p_actor, 'gender_identity', 'explicit_form', true, CASE WHEN v_consent THEN 'public' ELSE 'private' END, now())
    ON CONFLICT (user_id, field) DO UPDATE SET source='explicit_form', confirmed=true, visibility=CASE WHEN v_consent THEN 'public' ELSE 'private' END, updated_at=now();
    RETURN jsonb_build_object(
      'gender_identity', v_row.gender_identity,
      'self_description', v_row.self_description,
      'aggregate_publication', v_row.aggregate_publication,
      'onboarding_completed', true,
      'revision', v_row.revision,
      'updated_at', v_row.updated_at
    );
  END IF;
  RETURN wm_v0_command_before_gender(p_actor, p_action, p_input);
END $$;

ALTER FUNCTION wm_v0_command(text,text,jsonb) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_v0_command_before_gender(text,text,jsonb), wm_v0_command(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_v0_command(text,text,jsonb) TO convia_runtime;

-- Replace the V0 query to expose private disclosure and public aggregates.
ALTER FUNCTION wm_v0_query(text,text,text,jsonb) RENAME TO wm_v0_query_before_gender;

CREATE FUNCTION wm_v0_query(p_actor text,p_action text,p_resource text,p_filter jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb; v_row wm_profile_gender_disclosures%ROWTYPE; v_base jsonb; v_rep jsonb;
BEGIN
  p_filter := coalesce(p_filter,'{}'::jsonb);
  IF p_action = 'v0.gender.read' THEN
    SELECT * INTO v_row FROM wm_profile_gender_disclosures WHERE user_id = p_actor;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('onboarding_completed', false);
    END IF;
    RETURN jsonb_build_object(
      'onboarding_completed', true,
      'gender_identity', v_row.gender_identity,
      'self_description', v_row.self_description,
      'aggregate_publication', v_row.aggregate_publication,
      'revision', v_row.revision,
      'updated_at', v_row.updated_at
    );
  ELSIF p_action = 'v0.discover.list' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'trip', jsonb_build_object('trip_id', t.trip_id,'title', t.title,'destination_city_id', t.destination_city_id,'start_date', t.start_date,'end_date', t.end_date,'description', s.description,'capacity', s.capacity),
      'member_count', counts.n,
      'profile', jsonb_build_object('interests', coalesce(g.interests,'{}'::text[]),'pace', g.pace,'budget_band', g.budget_band),
      'gender_representation', jsonb_build_object(
        'women_public_count', rep.women_public_count,
        'active_traveller_count', rep.active_traveller_count,
        'other_or_not_public_count', rep.active_traveller_count - rep.women_public_count,
        'women_public_percentage', CASE WHEN rep.active_traveller_count = 0 THEN NULL ELSE (100.0 * rep.women_public_count / rep.active_traveller_count) END,
        'pending_request_count', pend.pending
      )
    ) ORDER BY t.start_date, t.trip_id), '[]'::jsonb) INTO v_result
    FROM trips t
    JOIN wm_trip_settings s USING(trip_id)
    LEFT JOIN wm_v0_trip_profiles g USING(trip_id)
    CROSS JOIN LATERAL (SELECT count(*) AS n FROM trip_members m WHERE m.trip_id = t.trip_id AND m.status = 'active') counts
    CROSS JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE p.app_role <> 'guest')::int AS active_traveller_count,
        count(*) FILTER (WHERE p.app_role <> 'guest' AND d.aggregate_publication AND d.gender_identity = 'woman')::int AS women_public_count
      FROM trip_members m
      JOIN wm_member_permissions p ON p.member_id = m.member_id
      LEFT JOIN wm_profile_gender_disclosures d ON d.user_id = m.user_id
      WHERE m.trip_id = t.trip_id AND m.status = 'active'
    ) rep
    CROSS JOIN LATERAL (SELECT count(*)::int AS pending FROM wm_join_requests j WHERE j.trip_id = t.trip_id AND j.state = 'pending') pend
    WHERE s.visibility = 'public'
      AND t.status IN ('planning','confirmed','in_progress')
      AND counts.n < s.capacity
      AND NOT EXISTS (SELECT 1 FROM trip_members own WHERE own.trip_id = t.trip_id AND own.user_id = p_actor AND own.status = 'active')
      AND (nullif(p_filter->>'destination_city_id','') IS NULL OR t.destination_city_id = p_filter->>'destination_city_id')
      AND (nullif(p_filter->>'start_date','') IS NULL OR t.start_date >= (p_filter->>'start_date')::date);
    RETURN v_result;
  ELSIF p_action = 'v0.public.preview' THEN
    v_base := wm_v0_query_before_gender(p_actor, p_action, p_resource, p_filter);
    IF v_base IS NULL THEN RETURN NULL; END IF;
    SELECT jsonb_build_object(
      'women_public_count', rep.women_public_count,
      'active_traveller_count', rep.active_traveller_count,
      'other_or_not_public_count', rep.active_traveller_count - rep.women_public_count,
      'women_public_percentage', CASE WHEN rep.active_traveller_count = 0 THEN NULL ELSE (100.0 * rep.women_public_count / rep.active_traveller_count) END,
      'pending_request_count', pend.pending
    ) INTO v_rep
    FROM (
      SELECT
        count(*) FILTER (WHERE p.app_role <> 'guest')::int AS active_traveller_count,
        count(*) FILTER (WHERE p.app_role <> 'guest' AND d.aggregate_publication AND d.gender_identity = 'woman')::int AS women_public_count
      FROM trip_members m
      JOIN wm_member_permissions p ON p.member_id = m.member_id
      LEFT JOIN wm_profile_gender_disclosures d ON d.user_id = m.user_id
      WHERE m.trip_id = p_resource AND m.status = 'active'
    ) rep
    CROSS JOIN LATERAL (SELECT count(*)::int AS pending FROM wm_join_requests j WHERE j.trip_id = p_resource AND j.state = 'pending') pend;
    RETURN v_base || jsonb_build_object('gender_representation', coalesce(v_rep, jsonb_build_object('women_public_count',0,'active_traveller_count',0,'other_or_not_public_count',0,'women_public_percentage',NULL,'pending_request_count',0)));
  END IF;
  RETURN wm_v0_query_before_gender(p_actor, p_action, p_resource, p_filter);
END $$;

ALTER FUNCTION wm_v0_query(text,text,text,jsonb) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_v0_query_before_gender(text,text,text,jsonb), wm_v0_query(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_v0_query(text,text,text,jsonb) TO convia_runtime;
