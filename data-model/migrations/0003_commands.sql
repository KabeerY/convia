-- Only trusted Core may call these SECURITY DEFINER functions. Never grant raw table access.
CREATE UNIQUE INDEX wm_one_active_itinerary ON itineraries(trip_id) WHERE is_active;
CREATE UNIQUE INDEX wm_one_active_owner ON trip_members(trip_id) WHERE role = 'owner' AND status = 'active';
CREATE INDEX wm_members_active_by_trip ON trip_members(trip_id, status);

CREATE FUNCTION wm_bootstrap_user(p_subject uuid, p_email text, p_display_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user text; v_city text; v_currency char(3); v_locale text;
BEGIN
  IF p_subject IS NULL OR p_email IS NULL OR p_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'INVALID_IDENTITY';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_subject::text));
  SELECT user_id INTO v_user FROM wm_auth_identities WHERE auth_subject = p_subject;
  IF v_user IS NOT NULL THEN RETURN v_user; END IF;
  -- Imported example users are never silently claimed by a real Auth account.
  IF EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_CANONICAL';
  END IF;
  SELECT city_id INTO v_city FROM cities WHERE status = 'active' ORDER BY city_id LIMIT 1;
  SELECT iso4217 INTO v_currency FROM currencies WHERE iso4217 = 'INR';
  SELECT bcp47 INTO v_locale FROM languages WHERE bcp47 = 'en-IN';
  IF v_city IS NULL OR v_currency IS NULL OR v_locale IS NULL THEN
    RAISE EXCEPTION 'REFERENCE_DATA_MISSING';
  END IF;
  v_user := 'usr_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO users(user_id,display_name,email,home_city_id,home_currency,locale,
    budget_band,travel_style,traveller_type,segment,date_of_signup,loyalty_tier,status,created_at,updated_at)
  VALUES(v_user,left(coalesce(nullif(trim(p_display_name),''),'Traveller'),120),lower(p_email),v_city,v_currency,v_locale,
    'mid','comfort','solo','cold_start',current_date,NULL,'active',now(),now());
  INSERT INTO wm_auth_identities(auth_subject,user_id) VALUES(p_subject,v_user);
  INSERT INTO wm_profile_field_state(user_id,field,source,confirmed)
  SELECT v_user, field, 'system_default', false FROM unnest(ARRAY[
    'home_city_id','home_currency','locale','budget_band','travel_style','traveller_type','segment'
  ]) AS field;
  RETURN v_user;
END $$;

CREATE FUNCTION wm_emit(p_trip text, p_kind text, p_resource text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sequence bigint;
BEGIN
  INSERT INTO wm_trip_sequences(trip_id,next_sequence) VALUES(p_trip,2)
    ON CONFLICT (trip_id) DO UPDATE SET next_sequence = wm_trip_sequences.next_sequence + 1
    RETURNING next_sequence - 1 INTO v_sequence;
  INSERT INTO wm_outbox(event_id,trip_id,sequence,kind,resource_id,payload)
    VALUES('evt_' || replace(gen_random_uuid()::text,'-',''),p_trip,v_sequence,p_kind,p_resource,p_payload);
END $$;

CREATE FUNCTION wm_member_role(p_actor text, p_trip text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.app_role FROM trip_members m JOIN wm_member_permissions p ON p.member_id = m.member_id
  WHERE m.trip_id = p_trip AND m.user_id = p_actor AND m.status = 'active'
$$;

CREATE FUNCTION wm_admit(p_actor text, p_trip text, p_role text, p_inviter text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_capacity int; v_count int; v_member text; v_removed boolean;
BEGIN
  -- Serializes all admission paths and removal/role changes on the parent trip.
  PERFORM 1 FROM trips WHERE trip_id = p_trip FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIP_NOT_FOUND'; END IF;
  SELECT capacity INTO v_capacity FROM wm_trip_settings WHERE trip_id = p_trip;
  IF v_capacity IS NULL THEN RAISE EXCEPTION 'TRIP_NOT_CONFIGURED'; END IF;
  SELECT removed_at IS NOT NULL AND cleared_at IS NULL INTO v_removed
    FROM wm_member_removals WHERE trip_id = p_trip AND user_id = p_actor;
  IF coalesce(v_removed,false) THEN RAISE EXCEPTION 'REMOVED_MEMBER'; END IF;
  SELECT member_id INTO v_member FROM trip_members WHERE trip_id = p_trip AND user_id = p_actor;
  IF v_member IS NOT NULL AND EXISTS(SELECT 1 FROM trip_members WHERE member_id = v_member AND status = 'active') THEN
    RETURN v_member;
  END IF;
  SELECT count(*) INTO v_count FROM trip_members WHERE trip_id = p_trip AND status = 'active';
  IF v_count >= v_capacity THEN RAISE EXCEPTION 'TRIP_FULL'; END IF;
  IF p_role NOT IN ('participant','guest') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  IF v_member IS NULL THEN
    v_member := 'mem_' || replace(gen_random_uuid()::text,'-','');
    INSERT INTO trip_members(member_id,trip_id,user_id,role,joined_at,share_weight,invited_by_user_id,status,updated_at)
    VALUES(v_member,p_trip,p_actor,CASE WHEN p_role = 'guest' THEN 'viewer' ELSE 'editor' END,
      now(),1,p_inviter,'active',now());
    INSERT INTO wm_member_permissions(member_id,app_role) VALUES(v_member,p_role);
  ELSE
    UPDATE trip_members SET status='active', role=CASE WHEN p_role='guest' THEN 'viewer' ELSE 'editor' END,
      joined_at=now(),invited_by_user_id=p_inviter,updated_at=now() WHERE member_id=v_member;
    INSERT INTO wm_member_permissions(member_id,app_role) VALUES(v_member,p_role)
      ON CONFLICT(member_id) DO UPDATE SET app_role=excluded.app_role,can_manage_admission=false,
        can_manage_members=false,can_manage_settings=false,updated_at=now();
  END IF;
  INSERT INTO wm_conversation_members(conversation_id,user_id)
    SELECT conversation_id,p_actor FROM wm_conversations
    WHERE trip_id=p_trip AND kind='trip_group'
    ON CONFLICT(conversation_id,user_id) DO UPDATE SET status='active';
  UPDATE wm_trip_settings SET access_epoch=access_epoch+1,updated_at=now() WHERE trip_id=p_trip;
  PERFORM wm_emit(p_trip,'member.joined',v_member,jsonb_build_object('user_id',p_actor));
  RETURN v_member;
END $$;

CREATE FUNCTION wm_trip_command(p_actor text, p_action text, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_trip text; v_member text; v_role text; v_owner text; v_code text; v_invite wm_invites%ROWTYPE;
  v_request wm_join_requests%ROWTYPE; v_capacity int; v_count int; v_target text; v_itinerary text;
  v_conversation text; v_policy text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE user_id=p_actor AND status='active') THEN RAISE EXCEPTION 'ACTOR_NOT_FOUND'; END IF;
  p_input := coalesce(p_input,'{}'::jsonb);
  v_trip := p_input->>'trip_id';
  IF p_action = 'trip.create' THEN
    IF nullif(trim(p_input->>'title'),'') IS NULL OR (p_input->>'start_date')::date > (p_input->>'end_date')::date THEN
      RAISE EXCEPTION 'INVALID_TRIP'; END IF;
    v_capacity := (p_input->>'capacity')::int;
    IF v_capacity < 1 OR v_capacity > 200 THEN RAISE EXCEPTION 'INVALID_CAPACITY'; END IF;
    v_policy := p_input->>'admission_policy';
    IF v_policy NOT IN ('open','approval','invite_only') THEN RAISE EXCEPTION 'INVALID_ADMISSION_POLICY'; END IF;
    v_trip := 'trp_' || replace(gen_random_uuid()::text,'-','');
    v_itinerary := 'itn_' || replace(gen_random_uuid()::text,'-','');
    v_member := 'mem_' || replace(gen_random_uuid()::text,'-','');
    v_conversation := 'con_' || replace(gen_random_uuid()::text,'-','');
    INSERT INTO trips(trip_id,owner_user_id,title,origin_city_id,destination_city_id,start_date,end_date,
      party_size,adults,children,trip_type,is_group_trip,status,home_currency,notes,created_at,updated_at)
    VALUES(v_trip,p_actor,trim(p_input->>'title'),nullif(p_input->>'origin_city_id',''),p_input->>'destination_city_id',
      (p_input->>'start_date')::date,(p_input->>'end_date')::date,v_capacity,1,0,'friends',true,
      'planning',coalesce(p_input->>'home_currency',(SELECT home_currency FROM users WHERE user_id=p_actor)),
      p_input->>'notes',now(),now());
    INSERT INTO wm_trip_settings(trip_id,visibility,capacity,admission_policy,timezone,description)
      VALUES(v_trip,coalesce(p_input->>'visibility','private'),v_capacity,v_policy,
        coalesce(p_input->>'timezone',(SELECT timezone FROM cities WHERE city_id=p_input->>'destination_city_id')),
        p_input->>'description');
    INSERT INTO trip_members(member_id,trip_id,user_id,role,joined_at,share_weight,status,updated_at)
      VALUES(v_member,v_trip,p_actor,'owner',now(),1,'active',now());
    INSERT INTO wm_member_permissions(member_id,app_role,can_manage_admission,can_manage_members,can_manage_settings)
      VALUES(v_member,'organizer',true,true,true);
    INSERT INTO itineraries(itinerary_id,trip_id,name,version,is_active,generated_by,total_cost,currency,
      total_duration_minutes,total_carbon_kg,status,created_at,updated_at)
      VALUES(v_itinerary,v_trip,'Main itinerary',1,true,'user',0,
        coalesce(p_input->>'home_currency',(SELECT home_currency FROM users WHERE user_id=p_actor)),0,0,'active',now(),now());
    INSERT INTO wm_conversations(conversation_id,trip_id,kind,created_by_user_id)
      VALUES(v_conversation,v_trip,'trip_group',p_actor);
    INSERT INTO wm_conversation_members(conversation_id,user_id) VALUES(v_conversation,p_actor);
    PERFORM wm_emit(v_trip,'trip.created',v_trip);
    RETURN jsonb_build_object('trip_id',v_trip,'itinerary_id',v_itinerary,'member_id',v_member);
  END IF;

  IF v_trip IS NULL THEN RAISE EXCEPTION 'TRIP_ID_REQUIRED'; END IF;
  PERFORM 1 FROM trips WHERE trip_id=v_trip FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIP_NOT_FOUND'; END IF;
  v_role := wm_member_role(p_actor,v_trip);
  IF p_action = 'invite.redeem' THEN
    SELECT * INTO v_invite FROM wm_invites WHERE trip_id=v_trip AND code_hash=digest(p_input->>'code','sha256') FOR UPDATE;
    IF NOT FOUND OR v_invite.revoked_at IS NOT NULL OR v_invite.expires_at <= now() OR v_invite.use_count >= v_invite.max_uses THEN
      RAISE EXCEPTION 'INVALID_INVITE'; END IF;
    IF v_role IS NOT NULL THEN RETURN jsonb_build_object('member_id',(SELECT member_id FROM trip_members WHERE trip_id=v_trip AND user_id=p_actor)); END IF;
    v_member := wm_admit(p_actor,v_trip,v_invite.target_role,v_invite.issued_by_user_id);
    UPDATE wm_invites SET use_count=use_count+1,updated_at=now() WHERE invite_id=v_invite.invite_id;
    RETURN jsonb_build_object('member_id',v_member);
  END IF;
  IF p_action = 'admission.request' THEN
    IF v_role IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
    IF EXISTS(SELECT 1 FROM wm_member_removals WHERE trip_id=v_trip AND user_id=p_actor AND cleared_at IS NULL) THEN
      RAISE EXCEPTION 'REMOVED_MEMBER'; END IF;
    SELECT admission_policy INTO v_policy FROM wm_trip_settings WHERE trip_id=v_trip AND visibility='public';
    IF v_policy IS NULL OR v_policy='invite_only' THEN RAISE EXCEPTION 'ADMISSION_CLOSED'; END IF;
    IF v_policy='open' THEN
      v_member := wm_admit(p_actor,v_trip,'participant',NULL);
      RETURN jsonb_build_object('state','accepted','member_id',v_member);
    END IF;
    SELECT * INTO v_request FROM wm_join_requests WHERE trip_id=v_trip AND requester_user_id=p_actor AND state='pending';
    IF FOUND THEN RETURN jsonb_build_object('state','pending','request_id',v_request.request_id); END IF;
    v_target := 'req_' || replace(gen_random_uuid()::text,'-','');
    INSERT INTO wm_join_requests(request_id,trip_id,requester_user_id,introduction,state)
      VALUES(v_target,v_trip,p_actor,left(coalesce(p_input->>'introduction',''),1000),'pending');
    PERFORM wm_emit(v_trip,'admission.requested',v_target);
    RETURN jsonb_build_object('state','pending','request_id',v_target);
  END IF;
  IF p_action = 'admission.withdraw' THEN
    UPDATE wm_join_requests SET state='withdrawn',updated_at=now() WHERE request_id=p_input->>'request_id'
      AND trip_id=v_trip AND requester_user_id=p_actor AND state='pending' RETURNING request_id INTO v_target;
    IF v_target IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_PENDING'; END IF;
    RETURN jsonb_build_object('request_id',v_target,'state','withdrawn');
  END IF;
  IF v_role IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED'; END IF;

  IF p_action IN ('invite.issue','invite.revoke','admission.review') THEN
    IF NOT EXISTS(SELECT 1 FROM trip_members m JOIN wm_member_permissions p USING(member_id)
      WHERE m.trip_id=v_trip AND m.user_id=p_actor AND m.status='active' AND p.can_manage_admission) THEN
      RAISE EXCEPTION 'ADMISSION_FORBIDDEN'; END IF;
  ELSIF p_action IN ('member.remove','member.restore','member.delegate') THEN
    IF NOT EXISTS(SELECT 1 FROM trip_members m JOIN wm_member_permissions p USING(member_id)
      WHERE m.trip_id=v_trip AND m.user_id=p_actor AND m.status='active' AND p.can_manage_members) THEN
      RAISE EXCEPTION 'MEMBER_MANAGEMENT_FORBIDDEN'; END IF;
  ELSIF p_action = 'trip.settings' THEN
    IF NOT EXISTS(SELECT 1 FROM trip_members m JOIN wm_member_permissions p USING(member_id)
      WHERE m.trip_id=v_trip AND m.user_id=p_actor AND m.status='active' AND p.can_manage_settings) THEN
      RAISE EXCEPTION 'SETTINGS_FORBIDDEN'; END IF;
  ELSIF p_action = 'ownership.transfer' THEN
    IF v_role <> 'organizer' THEN RAISE EXCEPTION 'ORGANIZER_REQUIRED'; END IF;
  END IF;

  IF p_action='invite.issue' THEN
    IF (p_input->>'target_role') NOT IN ('participant','guest') OR (p_input->>'max_uses')::int NOT BETWEEN 1 AND 1000
      OR (p_input->>'expires_at')::timestamptz <= now() THEN RAISE EXCEPTION 'INVALID_INVITE'; END IF;
    v_code := encode(gen_random_bytes(24),'hex');
    v_target := 'inv_' || replace(gen_random_uuid()::text,'-','');
    INSERT INTO wm_invites(invite_id,trip_id,code_hash,issued_by_user_id,target_role,expires_at,max_uses)
      VALUES(v_target,v_trip,digest(v_code,'sha256'),p_actor,p_input->>'target_role',
        (p_input->>'expires_at')::timestamptz,(p_input->>'max_uses')::int);
    RETURN jsonb_build_object('invite_id',v_target,'code',v_code);
  ELSIF p_action='invite.revoke' THEN
    UPDATE wm_invites SET revoked_at=now(),updated_at=now() WHERE invite_id=p_input->>'invite_id'
      AND trip_id=v_trip AND revoked_at IS NULL RETURNING invite_id INTO v_target;
    IF v_target IS NULL THEN RAISE EXCEPTION 'INVITE_NOT_FOUND'; END IF;
    RETURN jsonb_build_object('invite_id',v_target,'revoked',true);
  ELSIF p_action='admission.review' THEN
    SELECT * INTO v_request FROM wm_join_requests WHERE trip_id=v_trip AND request_id=p_input->>'request_id' FOR UPDATE;
    IF NOT FOUND OR v_request.state <> 'pending' THEN RAISE EXCEPTION 'REQUEST_NOT_PENDING'; END IF;
    IF (p_input->>'decision') NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
    IF p_input->>'decision'='accepted' THEN
      v_member := wm_admit(v_request.requester_user_id,v_trip,'participant',p_actor);
    END IF;
    UPDATE wm_join_requests SET state=p_input->>'decision',reviewer_user_id=p_actor,reviewed_at=now(),updated_at=now()
      WHERE request_id=v_request.request_id;
    PERFORM wm_emit(v_trip,'admission.reviewed',v_request.request_id);
    RETURN jsonb_build_object('request_id',v_request.request_id,'state',p_input->>'decision','member_id',v_member);
  ELSIF p_action='member.leave' OR p_action='member.remove' THEN
    v_target := CASE WHEN p_action='member.leave' THEN p_actor ELSE p_input->>'user_id' END;
    IF v_target IS NULL THEN RAISE EXCEPTION 'USER_ID_REQUIRED'; END IF;
    IF v_target=p_actor AND p_action='member.remove' THEN RAISE EXCEPTION 'USE_LEAVE'; END IF;
    SELECT owner_user_id INTO v_owner FROM trips WHERE trip_id=v_trip;
    IF v_target=v_owner THEN RAISE EXCEPTION 'TRANSFER_OWNERSHIP_FIRST'; END IF;
    UPDATE trip_members SET status='inactive',updated_at=now() WHERE trip_id=v_trip AND user_id=v_target AND status='active'
      RETURNING member_id INTO v_member;
    IF v_member IS NULL THEN RAISE EXCEPTION 'ACTIVE_MEMBER_NOT_FOUND'; END IF;
    UPDATE wm_conversation_members SET status='inactive' WHERE user_id=v_target AND conversation_id IN
      (SELECT conversation_id FROM wm_conversations WHERE trip_id=v_trip);
    IF p_action='member.remove' THEN
      INSERT INTO wm_member_removals(trip_id,user_id,removed_by_user_id) VALUES(v_trip,v_target,p_actor)
        ON CONFLICT(trip_id,user_id) DO UPDATE SET removed_by_user_id=excluded.removed_by_user_id,
          removed_at=now(),cleared_at=NULL,cleared_by_user_id=NULL;
    END IF;
    UPDATE wm_trip_settings SET access_epoch=access_epoch+1,updated_at=now() WHERE trip_id=v_trip;
    PERFORM wm_emit(v_trip,CASE WHEN p_action='member.leave' THEN 'member.left' ELSE 'member.removed' END,v_member);
    RETURN jsonb_build_object('member_id',v_member,'status','inactive');
  ELSIF p_action='member.restore' THEN
    UPDATE wm_member_removals SET cleared_at=now(),cleared_by_user_id=p_actor
      WHERE trip_id=v_trip AND user_id=p_input->>'user_id' AND cleared_at IS NULL RETURNING user_id INTO v_target;
    IF v_target IS NULL THEN RAISE EXCEPTION 'REMOVAL_NOT_FOUND'; END IF;
    RETURN jsonb_build_object('user_id',v_target,'may_request_admission',true);
  ELSIF p_action='ownership.transfer' THEN
    v_target := p_input->>'user_id';
    SELECT member_id INTO v_member FROM trip_members WHERE trip_id=v_trip AND user_id=v_target AND status='active';
    IF v_member IS NULL THEN RAISE EXCEPTION 'ACTIVE_MEMBER_NOT_FOUND'; END IF;
    UPDATE trip_members SET role='editor',updated_at=now() WHERE trip_id=v_trip AND user_id=p_actor;
    UPDATE wm_member_permissions SET app_role='co_organizer',can_manage_admission=true,can_manage_members=true,
      can_manage_settings=true,updated_at=now() WHERE member_id=(SELECT member_id FROM trip_members WHERE trip_id=v_trip AND user_id=p_actor);
    UPDATE trip_members SET role='owner',updated_at=now() WHERE member_id=v_member;
    UPDATE wm_member_permissions SET app_role='organizer',can_manage_admission=true,can_manage_members=true,
      can_manage_settings=true,updated_at=now() WHERE member_id=v_member;
    UPDATE trips SET owner_user_id=v_target,updated_at=now() WHERE trip_id=v_trip;
    PERFORM wm_emit(v_trip,'ownership.transferred',v_member);
    RETURN jsonb_build_object('owner_user_id',v_target);
  ELSIF p_action='member.delegate' THEN
    v_target := p_input->>'user_id';
    SELECT member_id INTO v_member FROM trip_members WHERE trip_id=v_trip AND user_id=v_target AND status='active' AND role='editor';
    IF v_member IS NULL OR v_target=p_actor THEN RAISE EXCEPTION 'DELEGATION_TARGET_INVALID'; END IF;
    IF p_input->>'app_role' NOT IN ('participant','co_organizer') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
    IF v_role <> 'organizer' AND p_input->>'app_role'='co_organizer' THEN RAISE EXCEPTION 'ORGANIZER_REQUIRED'; END IF;
    UPDATE wm_member_permissions SET app_role=p_input->>'app_role',
      can_manage_admission=(p_input->>'app_role'='co_organizer'),
      can_manage_members=(p_input->>'app_role'='co_organizer'),
      can_manage_settings=(p_input->>'app_role'='co_organizer'),updated_at=now() WHERE member_id=v_member;
    PERFORM wm_emit(v_trip,'member.role_changed',v_member);
    RETURN jsonb_build_object('member_id',v_member,'app_role',p_input->>'app_role');
  ELSIF p_action='trip.settings' THEN
    IF p_input ? 'capacity' THEN
      SELECT count(*) INTO v_count FROM trip_members WHERE trip_id=v_trip AND status='active';
      v_capacity := (p_input->>'capacity')::int;
      IF v_capacity < v_count OR v_capacity > 200 THEN RAISE EXCEPTION 'INVALID_CAPACITY'; END IF;
    END IF;
    UPDATE wm_trip_settings SET visibility=coalesce(p_input->>'visibility',visibility),
      capacity=coalesce(v_capacity,capacity),admission_policy=coalesce(p_input->>'admission_policy',admission_policy),
      description=coalesce(p_input->>'description',description),
      public_preview_version=public_preview_version+1,access_epoch=access_epoch+1,updated_at=now()
      WHERE trip_id=v_trip;
    PERFORM wm_emit(v_trip,'trip.settings_changed',v_trip);
    RETURN jsonb_build_object('trip_id',v_trip,'updated',true);
  END IF;
  RAISE EXCEPTION 'UNKNOWN_COMMAND';
END $$;

CREATE FUNCTION wm_trip_query(p_actor text, p_action text, p_trip text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_role text; v_result jsonb;
BEGIN
  IF p_action='trip.list' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('trip_id',t.trip_id,'title',t.title,
      'destination_city_id',t.destination_city_id,'start_date',t.start_date,'end_date',t.end_date,
      'app_role',coalesce(p.app_role,CASE WHEN m.role='owner' THEN 'organizer' WHEN m.role='viewer' THEN 'guest' ELSE 'participant' END))
      ORDER BY t.start_date,t.trip_id),'[]'::jsonb) INTO v_result
      FROM trip_members m JOIN trips t USING(trip_id) LEFT JOIN wm_member_permissions p USING(member_id)
      WHERE m.user_id=p_actor AND m.status='active';
    RETURN v_result;
  END IF;
  v_role := wm_member_role(p_actor,p_trip);
  IF p_action='trip.public_preview' THEN
    SELECT jsonb_build_object('trip_id',t.trip_id,'title',t.title,'destination_city_id',t.destination_city_id,
      'start_date',t.start_date,'end_date',t.end_date,'description',s.description,'capacity',s.capacity)
      INTO v_result FROM trips t JOIN wm_trip_settings s USING(trip_id)
      WHERE t.trip_id=p_trip AND s.visibility='public';
    RETURN v_result;
  END IF;
  IF v_role IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED'; END IF;
  IF p_action='trip.read' THEN
    SELECT jsonb_build_object('trip',to_jsonb(t),'settings',to_jsonb(s),'actor_role',v_role,
      'itinerary',to_jsonb(i)) INTO v_result FROM trips t LEFT JOIN wm_trip_settings s USING(trip_id)
      LEFT JOIN itineraries i ON i.trip_id=t.trip_id AND i.is_active WHERE t.trip_id=p_trip;
    RETURN v_result;
  ELSIF p_action='trip.members' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',u.display_name,
      'role',coalesce(p.app_role,CASE WHEN m.role='owner' THEN 'organizer' WHEN m.role='viewer' THEN 'guest' ELSE 'participant' END),
      'joined_at',m.joined_at) ORDER BY m.joined_at),'[]'::jsonb) INTO v_result
      FROM trip_members m JOIN users u USING(user_id) LEFT JOIN wm_member_permissions p USING(member_id)
      WHERE m.trip_id=p_trip AND m.status='active';
    RETURN v_result;
  ELSIF p_action='trip.join_requests' THEN
    IF v_role NOT IN ('organizer','co_organizer') THEN RAISE EXCEPTION 'ADMISSION_FORBIDDEN'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('request_id',r.request_id,'user_id',r.requester_user_id,
      'display_name',u.display_name,'introduction',r.introduction,'created_at',r.created_at)
      ORDER BY r.created_at),'[]'::jsonb) INTO v_result
      FROM wm_join_requests r JOIN users u ON u.user_id=r.requester_user_id
      WHERE r.trip_id=p_trip AND r.state='pending';
    RETURN v_result;
  ELSIF p_action='conversation.list' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('conversation_id',c.conversation_id,'kind',c.kind)
      ORDER BY c.created_at),'[]'::jsonb) INTO v_result
      FROM wm_conversations c JOIN wm_conversation_members cm USING(conversation_id)
      WHERE c.trip_id=p_trip AND cm.user_id=p_actor AND cm.status='active';
    RETURN v_result;
  ELSIF p_action='media.list' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('media_id',media_id,'content_type',content_type,
      'byte_size',byte_size,'created_at',created_at) ORDER BY created_at),'[]'::jsonb)
      INTO v_result FROM wm_media WHERE trip_id=p_trip AND status='ready';
    RETURN v_result;
  END IF;
  RAISE EXCEPTION 'UNKNOWN_QUERY';
END $$;

ALTER FUNCTION wm_bootstrap_user(uuid,text,text) OWNER TO convia_command_owner;
ALTER FUNCTION wm_emit(text,text,text,jsonb) OWNER TO convia_command_owner;
ALTER FUNCTION wm_member_role(text,text) OWNER TO convia_command_owner;
ALTER FUNCTION wm_admit(text,text,text,text) OWNER TO convia_command_owner;
ALTER FUNCTION wm_trip_command(text,text,jsonb) OWNER TO convia_command_owner;
ALTER FUNCTION wm_trip_query(text,text,text) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_bootstrap_user(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION wm_emit(text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION wm_member_role(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION wm_admit(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION wm_trip_command(text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION wm_trip_query(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_bootstrap_user(uuid,text,text),wm_member_role(text,text),
  wm_trip_command(text,text,jsonb),wm_trip_query(text,text,text) TO convia_runtime;
