-- Small additive V0 layer. The existing trip and decision functions remain
-- authoritative; move/fork is an add proposal plus a committed intent.
CREATE TABLE wm_v0_change_intents (
  change_set_id text PRIMARY KEY REFERENCES wm_change_sets(change_set_id),
  trip_id text NOT NULL REFERENCES trips(trip_id),
  kind text NOT NULL CHECK (kind IN ('move','fork')),
  source_item_id text NOT NULL REFERENCES itinerary_items(item_id),
  rejoin_at timestamptz,
  rejoin_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wm_v0_change_intents_trip_idx ON wm_v0_change_intents(trip_id,kind);

CREATE TABLE wm_v0_trip_profiles (
  trip_id text PRIMARY KEY REFERENCES trips(trip_id),
  interests text[] NOT NULL DEFAULT '{}',
  pace text,
  budget_band text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_v0_seeded_trips (
  seed_key text PRIMARY KEY,
  trip_id text NOT NULL UNIQUE REFERENCES trips(trip_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wm_v0_change_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wm_v0_trip_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wm_v0_seeded_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY convia_command_owner_access ON wm_v0_change_intents TO convia_command_owner USING (true) WITH CHECK (true);
CREATE POLICY convia_command_owner_access ON wm_v0_trip_profiles TO convia_command_owner USING (true) WITH CHECK (true);
CREATE POLICY convia_command_owner_access ON wm_v0_seeded_trips TO convia_command_owner USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON wm_v0_change_intents,wm_v0_trip_profiles,wm_v0_seeded_trips TO convia_command_owner;

CREATE FUNCTION wm_v0_committed_intent() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_intent wm_v0_change_intents%ROWTYPE;
BEGIN
  IF OLD.status IS DISTINCT FROM 'committed' AND NEW.status='committed' THEN
    SELECT * INTO v_intent FROM wm_v0_change_intents WHERE change_set_id=NEW.change_set_id;
    IF FOUND AND v_intent.kind='move' THEN
      UPDATE itinerary_items SET status='replaced',updated_at=now()
        WHERE item_id=v_intent.source_item_id AND status='confirmed';
      INSERT INTO wm_history_events(history_id,trip_id,change_set_id,event_kind,actor_user_id,detail)
        VALUES('his_' || replace(gen_random_uuid()::text,'-',''),NEW.trip_id,NEW.change_set_id,
          'item.moved',NEW.initiator_user_id,jsonb_build_object('prior_item_id',v_intent.source_item_id));
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION wm_v0_committed_intent() OWNER TO convia_command_owner;
CREATE TRIGGER wm_v0_after_commit AFTER UPDATE OF status ON wm_change_sets
  FOR EACH ROW EXECUTE FUNCTION wm_v0_committed_intent();

CREATE FUNCTION wm_v0_command(p_actor text,p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_trip text; v_item itinerary_items%ROWTYPE; v_itinerary itineraries%ROWTYPE;
  v_new jsonb; v_payload jsonb; v_decision jsonb; v_conversation wm_conversations%ROWTYPE;
  v_sequence bigint; v_message text; v_id text; v_client_id text; v_kind text;
BEGIN
  p_input := coalesce(p_input,'{}'::jsonb);
  IF p_action='v0.passport.save' THEN
    IF jsonb_typeof(p_input->'confirmed_fields') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_PASSPORT'; END IF;
    INSERT INTO wm_passports(passport_id,user_id,schema_version,confirmed_fields)
      VALUES('pas_' || replace(gen_random_uuid()::text,'-',''),p_actor,1,p_input->'confirmed_fields')
      ON CONFLICT(user_id) DO UPDATE SET revision=wm_passports.revision+1,
        confirmed_fields=excluded.confirmed_fields,updated_at=now();
    RETURN jsonb_build_object('confirmed_fields',p_input->'confirmed_fields');
  END IF;
  v_trip := p_input->>'trip_id';
  IF v_trip IS NULL OR wm_member_role(p_actor,v_trip) IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED'; END IF;
  IF p_action='v0.chat.send' THEN
    v_message := nullif(trim(p_input->>'body'),'');
    IF v_message IS NULL OR length(v_message)>1000 THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
    v_kind := coalesce(p_input->>'kind','member');
    IF v_kind NOT IN ('member','agent') THEN RAISE EXCEPTION 'INVALID_MESSAGE_KIND'; END IF;
    v_client_id := coalesce(nullif(p_input->>'client_message_id',''),'msg_' || replace(gen_random_uuid()::text,'-',''));
    SELECT * INTO v_conversation FROM wm_conversations WHERE trip_id=v_trip AND kind='trip_group' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND'; END IF;
    SELECT message_id INTO v_id FROM wm_messages WHERE conversation_id=v_conversation.conversation_id AND client_message_id=v_client_id;
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('message_id',v_id,'duplicate',true); END IF;
    v_sequence := v_conversation.next_sequence;
    UPDATE wm_conversations SET next_sequence=next_sequence+1,updated_at=now() WHERE conversation_id=v_conversation.conversation_id;
    v_id := 'msg_' || replace(gen_random_uuid()::text,'-','');
    INSERT INTO wm_messages(message_id,conversation_id,sender_user_id,content_kind,body,client_message_id,
      conversation_sequence,change_set_id)
      VALUES(v_id,v_conversation.conversation_id,CASE WHEN v_kind='agent' THEN NULL ELSE p_actor END,
        v_kind,v_message,v_client_id,v_sequence,nullif(p_input->>'change_set_id',''));
    PERFORM wm_emit(v_trip,'chat.message',v_id);
    RETURN jsonb_build_object('message_id',v_id,'sequence',v_sequence);
  ELSIF p_action='v0.change.propose' THEN
    IF wm_member_role(p_actor,v_trip)='guest' THEN RAISE EXCEPTION 'DECISION_FORBIDDEN'; END IF;
    IF coalesce(p_input->>'kind','') NOT IN ('move','fork') THEN RAISE EXCEPTION 'INVALID_CHANGE_KIND'; END IF;
    SELECT i.* INTO v_item FROM itinerary_items i JOIN itineraries n USING(itinerary_id)
      WHERE i.item_id=p_input->>'source_item_id' AND n.trip_id=v_trip AND n.is_active AND i.status='confirmed';
    IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
    SELECT * INTO v_itinerary FROM itineraries WHERE itinerary_id=v_item.itinerary_id;
    IF (p_input->>'base_itinerary_version')::integer IS DISTINCT FROM v_itinerary.version THEN RAISE EXCEPTION 'STALE_ITINERARY'; END IF;
    IF p_input->>'kind'='move' THEN
      v_new := jsonb_build_object('title',v_item.title,'item_type',v_item.item_type,
        'day_index',(p_input->>'day_index')::integer,'starts_at',p_input->>'starts_at','ends_at',p_input->>'ends_at');
    ELSE
      v_new := p_input->'alternative';
      IF nullif(p_input->>'rejoin_at','') IS NULL
        OR (p_input->>'rejoin_at')::timestamptz <= (v_new->>'ends_at')::timestamptz
        OR (p_input->>'rejoin_at')::timestamptz AT TIME ZONE
          (SELECT timezone FROM wm_trip_settings WHERE trip_id=v_trip) >=
          (SELECT end_date + interval '1 day' FROM trips WHERE trip_id=v_trip)
        THEN RAISE EXCEPTION 'INVALID_REJOIN'; END IF;
    END IF;
    v_payload := jsonb_build_object('trip_id',v_trip,'base_itinerary_version',v_itinerary.version,
      'title',CASE WHEN p_input->>'kind'='move' THEN 'Move ' || v_item.title ELSE 'Fork ' || v_item.title END,
      'operations',jsonb_build_array(jsonb_build_object('action','add','new_item',v_new,'cost_basis','unknown')));
    v_decision := wm_decision_command(p_actor,'decision.publish',v_payload);
    INSERT INTO wm_v0_change_intents(change_set_id,trip_id,kind,source_item_id,rejoin_at,rejoin_note)
      VALUES(v_decision->>'change_set_id',v_trip,p_input->>'kind',v_item.item_id,
        CASE WHEN p_input->>'kind'='fork' THEN (p_input->>'rejoin_at')::timestamptz ELSE NULL END,
        nullif(p_input->>'rejoin_note',''));
    RETURN v_decision;
  END IF;
  RAISE EXCEPTION 'UNKNOWN_COMMAND';
END $$;

CREATE FUNCTION wm_v0_query(p_actor text,p_action text,p_resource text,p_filter jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb; v_trip text; v_role text;
BEGIN
  p_filter := coalesce(p_filter,'{}'::jsonb);
  IF p_action='v0.passport.read' THEN
    SELECT jsonb_build_object('confirmed_fields',confirmed_fields,'revision',revision)
      INTO v_result FROM wm_passports WHERE user_id=p_actor;
    RETURN coalesce(v_result,'{"confirmed_fields":{"interests":[],"pace":"","budget_band":""}}'::jsonb);
  ELSIF p_action='v0.discover.list' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'trip',jsonb_build_object('trip_id',t.trip_id,'title',t.title,'destination_city_id',t.destination_city_id,
        'start_date',t.start_date,'end_date',t.end_date,'description',s.description,'capacity',s.capacity),
      'member_count',counts.n,'profile',jsonb_build_object('interests',coalesce(g.interests,'{}'::text[]),
        'pace',g.pace,'budget_band',g.budget_band)) ORDER BY t.start_date,t.trip_id),'[]'::jsonb) INTO v_result
      FROM trips t JOIN wm_trip_settings s USING(trip_id)
      LEFT JOIN wm_v0_trip_profiles g USING(trip_id)
      CROSS JOIN LATERAL (SELECT count(*) AS n FROM trip_members m WHERE m.trip_id=t.trip_id AND m.status='active') counts
      WHERE s.visibility='public' AND t.status IN ('planning','confirmed','in_progress') AND counts.n<s.capacity
        AND NOT EXISTS(SELECT 1 FROM trip_members own WHERE own.trip_id=t.trip_id AND own.user_id=p_actor AND own.status='active')
        AND (nullif(p_filter->>'destination_city_id','') IS NULL OR t.destination_city_id=p_filter->>'destination_city_id')
        AND (nullif(p_filter->>'start_date','') IS NULL OR t.start_date >= (p_filter->>'start_date')::date);
    RETURN v_result;
  ELSIF p_action='v0.public.preview' THEN
    SELECT jsonb_build_object('trip',jsonb_build_object('trip_id',t.trip_id,'title',t.title,
      'destination_city_id',t.destination_city_id,'start_date',t.start_date,'end_date',t.end_date,
      'description',s.description,'capacity',s.capacity),
      'itinerary_preview',coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',i.item_id,'title',i.title)
        ORDER BY i.day_index,i.sort_order) FROM itinerary_items i JOIN itineraries n USING(itinerary_id)
        WHERE n.trip_id=t.trip_id AND n.is_active AND i.status='confirmed'),'[]'::jsonb))
      INTO v_result FROM trips t JOIN wm_trip_settings s USING(trip_id)
      WHERE t.trip_id=p_resource AND s.visibility='public';
    RETURN v_result;
  END IF;
  v_trip := p_resource;
  v_role := wm_member_role(p_actor,v_trip);
  IF p_action='v0.genome.read' AND v_role IS NULL THEN
    IF NOT EXISTS(SELECT 1 FROM wm_trip_settings WHERE trip_id=v_trip AND visibility='public') THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED'; END IF;
  ELSIF v_role IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED'; END IF;
  IF p_action='v0.genome.read' THEN
    SELECT jsonb_build_object('profile',jsonb_build_object('interests',coalesce(g.interests,'{}'::text[]),
      'pace',g.pace,'budget_band',g.budget_band),
      'member_passports',CASE WHEN v_role IS NULL THEN '[]'::jsonb ELSE
        coalesce((SELECT jsonb_agg(p.confirmed_fields) FROM trip_members m
          JOIN wm_passports p ON p.user_id=m.user_id WHERE m.trip_id=v_trip AND m.status='active'),'[]'::jsonb) END,
      'member_count',(SELECT count(*) FROM trip_members m WHERE m.trip_id=v_trip AND m.status='active'))
      INTO v_result FROM wm_trip_settings s LEFT JOIN wm_v0_trip_profiles g USING(trip_id)
      WHERE s.trip_id=v_trip;
    RETURN coalesce(v_result,'{}'::jsonb);
  ELSIF p_action='v0.chat.list' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('message_id',m.message_id,'sender_user_id',m.sender_user_id,
      'display_name',CASE WHEN m.content_kind='agent' THEN 'Trippy' ELSE u.display_name END,
      'content_kind',m.content_kind,'body',m.body,'created_at',m.created_at,
      'change_set_id',m.change_set_id,'is_mine',m.sender_user_id=p_actor)
      ORDER BY m.conversation_sequence),'[]'::jsonb) INTO v_result
      FROM wm_messages m JOIN wm_conversations c USING(conversation_id)
      LEFT JOIN users u ON u.user_id=m.sender_user_id WHERE c.trip_id=v_trip AND c.kind='trip_group';
    RETURN v_result;
  ELSIF p_action='v0.forks.list' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('fork_id',f.change_set_id,'source_item_id',f.source_item_id,
      'alternative_item_id',alt.current_item_id,'rejoin_at',f.rejoin_at,'rejoin_note',f.rejoin_note,
      'day_index',src.day_index) ORDER BY f.created_at),'[]'::jsonb) INTO v_result
      FROM wm_v0_change_intents f JOIN wm_change_sets d USING(change_set_id)
      JOIN itinerary_items src ON src.item_id=f.source_item_id
      LEFT JOIN wm_item_state alt ON alt.latest_change_set_id=f.change_set_id
      WHERE f.trip_id=v_trip AND f.kind='fork' AND d.status='committed';
    RETURN v_result;
  ELSIF p_action='v0.events.latest' THEN
    SELECT jsonb_build_object('sequence',coalesce(max(sequence),0)) INTO v_result FROM wm_outbox WHERE trip_id=v_trip;
    RETURN v_result;
  END IF;
  RAISE EXCEPTION 'UNKNOWN_QUERY';
END $$;

ALTER FUNCTION wm_v0_command(text,text,jsonb) OWNER TO convia_command_owner;
ALTER FUNCTION wm_v0_query(text,text,text,jsonb) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_v0_command(text,text,jsonb),wm_v0_query(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_v0_command(text,text,jsonb),wm_v0_query(text,text,text,jsonb) TO convia_runtime;
