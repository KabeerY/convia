-- V0 decision authority. The canonical optimizer `locked` column is unchanged.
ALTER TABLE wm_change_sets ADD COLUMN title text;
ALTER TABLE wm_change_sets ADD COLUMN revision integer NOT NULL DEFAULT 0;
CREATE TABLE wm_decision_retries (
  actor_user_id text NOT NULL REFERENCES users(user_id),
  idempotency_key text NOT NULL,
  change_set_id text NOT NULL REFERENCES wm_change_sets(change_set_id),
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  PRIMARY KEY (actor_user_id, idempotency_key)
);
ALTER TABLE wm_decision_retries ENABLE ROW LEVEL SECURITY;
CREATE POLICY convia_command_owner_access ON wm_decision_retries
  TO convia_command_owner USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON wm_decision_retries TO convia_command_owner;

CREATE FUNCTION wm_decision_snapshot(p_actor text, p_change_set text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'change_set_id', c.change_set_id, 'trip_id', c.trip_id, 'title', c.title,
    'status', c.status, 'state', c.status, 'revision', c.revision,
    'base_itinerary_version', c.base_itinerary_version,
    'eligible_count', (SELECT count(*) FROM wm_electorate e WHERE e.change_set_id=c.change_set_id),
    'threshold', c.approval_threshold, 'approval_threshold', c.approval_threshold,
    'yes_count', (SELECT count(*) FROM wm_ballots b WHERE b.change_set_id=c.change_set_id AND b.value='yes'),
    'no_count', (SELECT count(*) FROM wm_ballots b WHERE b.change_set_id=c.change_set_id AND b.value='no'),
    'actor_ballot', (SELECT b.value FROM wm_ballots b WHERE b.change_set_id=c.change_set_id AND b.user_id=p_actor),
    'closes_at', c.closes_at, 'created_at', c.created_at,
    'committed_itinerary_version', r.committed_itinerary_version,
    'operations', (SELECT coalesce(jsonb_agg(e.payload ORDER BY e.ordinal),'[]'::jsonb)
      FROM wm_decision_entries e WHERE e.change_set_id=c.change_set_id)
  ) FROM wm_change_sets c LEFT JOIN wm_commit_records r USING(change_set_id)
  WHERE c.change_set_id=p_change_set
$$;

CREATE FUNCTION wm_decision_query(p_actor text, p_action text, p_resource text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_trip text; v_itinerary text; v_result jsonb;
BEGIN
  IF p_action='decision.read' THEN
    SELECT trip_id INTO v_trip FROM wm_change_sets WHERE change_set_id=p_resource;
    IF v_trip IS NULL THEN RAISE EXCEPTION 'DECISION_NOT_FOUND'; END IF;
  ELSIF p_action='item.read' THEN
    SELECT i.trip_id INTO v_trip FROM wm_item_state s
      JOIN itineraries i USING(itinerary_id) WHERE s.logical_item_id=p_resource;
    IF v_trip IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
  ELSE
    v_trip := p_resource;
  END IF;
  IF wm_member_role(p_actor,v_trip) IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED'; END IF;
  IF p_action='decision.read' THEN
    RETURN wm_decision_snapshot(p_actor,p_resource);
  ELSIF p_action='item.read' THEN
    SELECT jsonb_build_object('logical_item_id',s.logical_item_id,
      'revision',s.revision,'decision_locked',s.decision_locked,
      'current_item_id',s.current_item_id) INTO v_result
      FROM wm_item_state s WHERE s.logical_item_id=p_resource;
    RETURN v_result;
  ELSIF p_action='decision.list' THEN
    SELECT coalesce(jsonb_agg(wm_decision_snapshot(p_actor,c.change_set_id)
      ORDER BY c.created_at DESC),'[]'::jsonb) INTO v_result
      FROM wm_change_sets c WHERE c.trip_id=v_trip;
    RETURN v_result;
  ELSIF p_action='itinerary.read' THEN
    SELECT itinerary_id INTO v_itinerary FROM itineraries WHERE trip_id=v_trip AND is_active;
    IF v_itinerary IS NULL THEN RAISE EXCEPTION 'ITINERARY_NOT_FOUND'; END IF;
    SELECT jsonb_build_object('itinerary_id',i.itinerary_id,'version',i.version,
      'items',coalesce((SELECT jsonb_agg(to_jsonb(item) || jsonb_build_object(
        'logical_item_id',s.logical_item_id,'revision',s.revision,
        'decision_locked',coalesce(s.decision_locked,false)) ORDER BY item.day_index,item.sort_order)
        FROM itinerary_items item LEFT JOIN wm_item_state s ON s.current_item_id=item.item_id
        WHERE item.itinerary_id=i.itinerary_id AND item.status='confirmed'),'[]'::jsonb))
      INTO v_result FROM itineraries i WHERE i.itinerary_id=v_itinerary;
    RETURN v_result;
  ELSIF p_action='history.list' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('history_id',h.history_id,
      'change_set_id',h.change_set_id,'logical_item_id',h.logical_item_id,
      'event_kind',h.event_kind,'detail',h.detail,'occurred_at',h.occurred_at,
      'decision',CASE WHEN h.change_set_id IS NULL THEN NULL
        ELSE wm_decision_snapshot(p_actor,h.change_set_id) END)
      ORDER BY h.occurred_at DESC,h.history_id),'[]'::jsonb) INTO v_result
      FROM wm_history_events h WHERE h.trip_id=v_trip;
    RETURN v_result;
  END IF;
  RAISE EXCEPTION 'UNKNOWN_QUERY';
END $$;

CREATE FUNCTION wm_decision_command(p_actor text, p_action text, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_trip text; v_itinerary itineraries%ROWTYPE; v_change wm_change_sets%ROWTYPE;
  v_operation jsonb; v_item jsonb; v_settings wm_trip_settings%ROWTYPE;
  v_id text; v_proposal text; v_item_id text; v_logical text; v_role text;
  v_count integer; v_yes integer; v_no integer; v_threshold integer; v_revision integer;
  v_starts timestamptz; v_ends timestamptz; v_deadline timestamptz;
  v_hash text; v_key text; v_retry wm_decision_retries%ROWTYPE; v_result jsonb;
BEGIN
  p_input := coalesce(p_input,'{}'::jsonb);
  IF p_action='decision.publish' THEN
    v_trip := p_input->>'trip_id';
  ELSIF p_action='decision.vote' THEN
    SELECT trip_id INTO v_trip FROM wm_change_sets WHERE change_set_id=p_input->>'change_set_id';
  ELSE RAISE EXCEPTION 'UNKNOWN_COMMAND'; END IF;
  IF v_trip IS NULL THEN RAISE EXCEPTION 'TRIP_NOT_FOUND'; END IF;
  -- All decision writers acquire locks in this order.
  PERFORM 1 FROM trips WHERE trip_id=v_trip FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIP_NOT_FOUND'; END IF;
  SELECT * INTO v_itinerary FROM itineraries WHERE trip_id=v_trip AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITINERARY_NOT_FOUND'; END IF;
  v_role := wm_member_role(p_actor,v_trip);
  IF v_role IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED'; END IF;

  IF p_action='decision.publish' THEN
    IF v_role='guest' THEN RAISE EXCEPTION 'DECISION_FORBIDDEN'; END IF;
    IF jsonb_typeof(p_input->'operations') <> 'array'
      OR jsonb_array_length(p_input->'operations') <> 1 THEN
      RAISE EXCEPTION 'ONE_OPERATION_REQUIRED'; END IF;
    v_operation := p_input->'operations'->0;
    IF jsonb_typeof(v_operation) IS DISTINCT FROM 'object'
      OR coalesce(v_operation->>'action','') <> 'add' THEN
      RAISE EXCEPTION 'UNSUPPORTED_OPERATION'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_operation) AS keys(field)
      WHERE field NOT IN ('action','new_item','cost_basis'))
      OR coalesce(v_operation->>'cost_basis','unknown') <> 'unknown' THEN
      RAISE EXCEPTION 'UNSUPPORTED_OPERATION_FIELD'; END IF;
    v_item := v_operation->'new_item';
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_ITEM'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_item) AS keys(field)
      WHERE field NOT IN ('title','item_type','day_index','starts_at','ends_at'))
      OR nullif(trim(v_item->>'title'),'') IS NULL OR length(v_item->>'title') > 200
      OR coalesce(v_item->>'item_type','') NOT IN ('hotel','flight','poi','package','guide','transfer','meal','free')
      OR jsonb_typeof(v_item->'day_index') IS DISTINCT FROM 'number'
      OR coalesce((v_item->>'day_index')::integer,0) < 1
      OR coalesce((v_item->>'day_index')::integer,0) > 32767 THEN
      RAISE EXCEPTION 'INVALID_ITEM'; END IF;
    IF (p_input->>'base_itinerary_version')::integer IS DISTINCT FROM v_itinerary.version THEN
      RAISE EXCEPTION 'STALE_ITINERARY'; END IF;
    SELECT * INTO v_settings FROM wm_trip_settings WHERE trip_id=v_trip;
    IF v_item ? 'starts_at' THEN v_starts := (v_item->>'starts_at')::timestamptz; END IF;
    IF v_item ? 'ends_at' THEN v_ends := (v_item->>'ends_at')::timestamptz; END IF;
    IF v_starts IS NULL OR v_ends IS NULL OR v_ends <= v_starts
      OR (v_starts AT TIME ZONE v_settings.timezone)::date NOT BETWEEN
        (SELECT start_date FROM trips WHERE trip_id=v_trip) AND
        (SELECT end_date FROM trips WHERE trip_id=v_trip)
      OR (v_ends AT TIME ZONE v_settings.timezone)::date NOT BETWEEN
        (SELECT start_date FROM trips WHERE trip_id=v_trip) AND
        (SELECT end_date FROM trips WHERE trip_id=v_trip)
      OR (v_starts AT TIME ZONE v_settings.timezone)::date -
        (SELECT start_date FROM trips WHERE trip_id=v_trip) + 1 <>
        (v_item->>'day_index')::integer THEN
      RAISE EXCEPTION 'INVALID_ITEM_TIME'; END IF;
    IF nullif(trim(p_input->>'title'),'') IS NULL THEN RAISE EXCEPTION 'INVALID_TITLE'; END IF;
    SELECT count(*) INTO v_count FROM trip_members m JOIN wm_member_permissions p USING(member_id)
      WHERE m.trip_id=v_trip AND m.status='active' AND p.app_role <> 'guest';
    IF v_count=0 THEN RAISE EXCEPTION 'EMPTY_ELECTORATE'; END IF;
    v_threshold := v_count/2+1;
    v_deadline := coalesce((p_input->>'requested_closes_at')::timestamptz,now()+interval '24 hours');
    IF v_deadline <= now() OR v_deadline > now()+interval '7 days' THEN
      RAISE EXCEPTION 'INVALID_DEADLINE'; END IF;
    v_id := 'chg_' || replace(gen_random_uuid()::text,'-','');
    v_proposal := 'pro_' || replace(gen_random_uuid()::text,'-','');
    v_hash := encode(digest((p_input->'operations')::text,'sha256'),'hex');
    INSERT INTO wm_change_sets(change_set_id,trip_id,itinerary_id,initiator_user_id,
      actor_kind,base_itinerary_version,status,approval_threshold,closes_at,payload_hash,title)
    VALUES(v_id,v_trip,v_itinerary.itinerary_id,p_actor,'user',v_itinerary.version,
      'open',v_threshold,v_deadline,v_hash,trim(p_input->>'title'));
    INSERT INTO proposals(proposal_id,itinerary_id,proposed_by_user_id,action,title,
      cost_delta,currency,closes_at,status,created_at,updated_at)
    VALUES(v_proposal,v_itinerary.itinerary_id,p_actor,'add',trim(p_input->>'title'),
      0,v_itinerary.currency,v_deadline,'open',now(),now());
    INSERT INTO wm_decision_entries(entry_id,change_set_id,proposal_id,ordinal,payload)
    VALUES('ent_' || replace(gen_random_uuid()::text,'-',''),v_id,v_proposal,1,v_operation);
    INSERT INTO wm_electorate(change_set_id,user_id,role_snapshot)
      SELECT v_id,m.user_id,p.app_role FROM trip_members m
      JOIN wm_member_permissions p USING(member_id)
      WHERE m.trip_id=v_trip AND m.status='active' AND p.app_role <> 'guest';
    INSERT INTO wm_history_events(history_id,trip_id,change_set_id,event_kind,actor_user_id,detail)
      VALUES('his_' || replace(gen_random_uuid()::text,'-',''),v_trip,v_id,'decision.published',p_actor,
        jsonb_build_object('title',trim(p_input->>'title'),'threshold',v_threshold));
    PERFORM wm_emit(v_trip,'proposal.published',v_id);
    RETURN wm_decision_snapshot(p_actor,v_id);
  END IF;

  SELECT * INTO v_change FROM wm_change_sets WHERE change_set_id=p_input->>'change_set_id' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DECISION_NOT_FOUND'; END IF;
  v_key := nullif(p_input->>'idempotency_key','');
  v_hash := encode(digest(jsonb_build_object('change_set_id',v_change.change_set_id,
    'vote',p_input->>'vote','expected_revision',p_input->'expected_revision')::text,'sha256'),'hex');
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_retry FROM wm_decision_retries
      WHERE actor_user_id=p_actor AND idempotency_key=v_key;
    IF FOUND THEN
      IF v_retry.change_set_id <> v_change.change_set_id OR v_retry.request_hash <> v_hash THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
      RETURN v_retry.response;
    END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM wm_electorate WHERE change_set_id=v_change.change_set_id AND user_id=p_actor)
    OR v_role='guest' THEN RAISE EXCEPTION 'DECISION_FORBIDDEN'; END IF;
  IF v_change.status <> 'open' THEN RAISE EXCEPTION 'DECISION_CLOSED'; END IF;
  IF v_change.closes_at <= now() THEN
    UPDATE wm_change_sets SET status='expired',updated_at=now() WHERE change_set_id=v_change.change_set_id;
    UPDATE proposals SET status='expired',updated_at=now() WHERE proposal_id IN
      (SELECT proposal_id FROM wm_decision_entries WHERE change_set_id=v_change.change_set_id);
    PERFORM wm_emit(v_trip,'proposal.closed',v_change.change_set_id);
    RETURN wm_decision_snapshot(p_actor,v_change.change_set_id);
  END IF;
  IF coalesce(p_input->>'vote','') NOT IN ('yes','no') OR jsonb_typeof(p_input->'expected_revision') IS DISTINCT FROM 'number'
    THEN RAISE EXCEPTION 'INVALID_BALLOT'; END IF;
  v_revision := (p_input->>'expected_revision')::integer;
  IF v_revision <> v_change.revision THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
  INSERT INTO wm_ballots(change_set_id,user_id,value) VALUES(v_change.change_set_id,p_actor,p_input->>'vote')
    ON CONFLICT(change_set_id,user_id) DO UPDATE SET value=excluded.value,updated_at=now();
  INSERT INTO wm_ballot_events(ballot_event_id,change_set_id,user_id,value)
    VALUES('bev_' || replace(gen_random_uuid()::text,'-',''),v_change.change_set_id,p_actor,p_input->>'vote');
  INSERT INTO votes(vote_id,proposal_id,user_id,value,weight,cast_at,updated_at)
    SELECT 'vot_' || replace(gen_random_uuid()::text,'-',''),e.proposal_id,p_actor,p_input->>'vote',1,now(),now()
    FROM wm_decision_entries e WHERE e.change_set_id=v_change.change_set_id
    ON CONFLICT(proposal_id,user_id) DO UPDATE SET value=excluded.value,updated_at=now();
  UPDATE wm_change_sets SET revision=revision+1,updated_at=now() WHERE change_set_id=v_change.change_set_id;
  SELECT count(*) INTO v_yes FROM wm_ballots WHERE change_set_id=v_change.change_set_id AND value='yes';
  SELECT count(*) INTO v_no FROM wm_ballots WHERE change_set_id=v_change.change_set_id AND value='no';
  IF v_yes >= v_change.approval_threshold THEN
    IF v_itinerary.version <> v_change.base_itinerary_version THEN
      UPDATE wm_change_sets SET status='stale',updated_at=now() WHERE change_set_id=v_change.change_set_id;
      UPDATE proposals SET status='rejected',updated_at=now() WHERE proposal_id IN
        (SELECT proposal_id FROM wm_decision_entries WHERE change_set_id=v_change.change_set_id);
      PERFORM wm_emit(v_trip,'proposal.closed',v_change.change_set_id);
    ELSE
      SELECT payload INTO v_operation FROM wm_decision_entries
        WHERE change_set_id=v_change.change_set_id AND ordinal=1;
      v_item := v_operation->'new_item';
      v_starts := (v_item->>'starts_at')::timestamptz;
      v_ends := (v_item->>'ends_at')::timestamptz;
      v_item_id := 'itm_' || replace(gen_random_uuid()::text,'-','');
      v_logical := 'log_' || replace(gen_random_uuid()::text,'-','');
      INSERT INTO itinerary_items(item_id,itinerary_id,day_index,sort_order,starts_at,ends_at,
        item_type,title,cost,currency,carbon_kg,duration_minutes,source,locked,status,created_at,updated_at)
      VALUES(v_item_id,v_itinerary.itinerary_id,(v_item->>'day_index')::smallint,
        coalesce((SELECT max(sort_order)+1 FROM itinerary_items WHERE itinerary_id=v_itinerary.itinerary_id
          AND day_index=(v_item->>'day_index')::smallint),1),v_starts,v_ends,
        v_item->>'item_type',trim(v_item->>'title'),0,v_itinerary.currency,0,
        ceil(extract(epoch FROM v_ends-v_starts)/60)::integer,'vote',false,'confirmed',now(),now());
      INSERT INTO wm_cost_metadata(item_id,cost_basis,cost_state)
        VALUES(v_item_id,'unknown','unknown');
      INSERT INTO wm_item_state(logical_item_id,itinerary_id,current_item_id,revision,
        decision_locked,latest_change_set_id)
        VALUES(v_logical,v_itinerary.itinerary_id,v_item_id,1,true,v_change.change_set_id);
      INSERT INTO wm_item_revisions(item_revision_id,logical_item_id,revision,item_id,snapshot,change_set_id)
        SELECT 'rev_' || replace(gen_random_uuid()::text,'-',''),v_logical,1,v_item_id,
          to_jsonb(item),v_change.change_set_id FROM itinerary_items item WHERE item_id=v_item_id;
      UPDATE itineraries SET version=version+1,generated_by='vote',
        total_duration_minutes=total_duration_minutes+ceil(extract(epoch FROM v_ends-v_starts)/60)::integer,
        updated_at=now() WHERE itinerary_id=v_itinerary.itinerary_id;
      UPDATE wm_change_sets SET status='committed',committed_at=now(),updated_at=now()
        WHERE change_set_id=v_change.change_set_id;
      UPDATE proposals SET status='accepted',updated_at=now() WHERE proposal_id IN
        (SELECT proposal_id FROM wm_decision_entries WHERE change_set_id=v_change.change_set_id);
      INSERT INTO wm_commit_records(change_set_id,committed_itinerary_version)
        VALUES(v_change.change_set_id,v_itinerary.version+1);
      INSERT INTO wm_history_events(history_id,trip_id,logical_item_id,change_set_id,event_kind,actor_user_id,detail)
        VALUES('his_' || replace(gen_random_uuid()::text,'-',''),v_trip,v_logical,v_change.change_set_id,
          'item.added',p_actor,jsonb_build_object('item_id',v_item_id,'revision',1));
      INSERT INTO wm_history_events(history_id,trip_id,change_set_id,event_kind,actor_user_id,detail)
        VALUES('his_' || replace(gen_random_uuid()::text,'-',''),v_trip,v_change.change_set_id,
          'decision.committed',p_actor,jsonb_build_object('itinerary_version',v_itinerary.version+1));
      PERFORM wm_emit(v_trip,'decision.committed',v_change.change_set_id,
        jsonb_build_object('itinerary_version',v_itinerary.version+1));
    END IF;
  ELSIF v_no > (SELECT count(*) FROM wm_electorate WHERE change_set_id=v_change.change_set_id)
    - v_change.approval_threshold THEN
    UPDATE wm_change_sets SET status='rejected',updated_at=now() WHERE change_set_id=v_change.change_set_id;
    UPDATE proposals SET status='rejected',updated_at=now() WHERE proposal_id IN
      (SELECT proposal_id FROM wm_decision_entries WHERE change_set_id=v_change.change_set_id);
    PERFORM wm_emit(v_trip,'proposal.closed',v_change.change_set_id);
  ELSE
    PERFORM wm_emit(v_trip,'vote.recorded',v_change.change_set_id);
  END IF;
  v_result := wm_decision_snapshot(p_actor,v_change.change_set_id);
  IF v_key IS NOT NULL THEN
    INSERT INTO wm_decision_retries(actor_user_id,idempotency_key,change_set_id,request_hash,response)
      VALUES(p_actor,v_key,v_change.change_set_id,v_hash,v_result);
  END IF;
  RETURN v_result;
END $$;

ALTER FUNCTION wm_decision_snapshot(text,text) OWNER TO convia_command_owner;
ALTER FUNCTION wm_decision_query(text,text,text) OWNER TO convia_command_owner;
ALTER FUNCTION wm_decision_command(text,text,jsonb) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_decision_snapshot(text,text),wm_decision_query(text,text,text),
  wm_decision_command(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_decision_query(text,text,text),wm_decision_command(text,text,jsonb)
  TO convia_runtime;
