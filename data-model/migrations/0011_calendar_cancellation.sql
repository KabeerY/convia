-- Avoid a PL/pgSQL record/alias collision when cancelling nested branches.
CREATE OR REPLACE FUNCTION wm_calendar_apply(p_actor text,p_trip text,p_branch text,p_kind text,p_item text,p_data jsonb) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id text := p_item; n itineraries%ROWTYPE; tz text; b wm_calendar_branches%ROWTYPE;
BEGIN
 PERFORM wm_calendar_validate(p_trip,p_branch,p_kind,p_item,p_data);
 IF p_kind='review' THEN
  SELECT * INTO b FROM wm_calendar_branches WHERE branch_id=p_branch;
  PERFORM wm_calendar_validate_branch(p_trip,b.parent_branch_id,p_data->>'source_item_id',(p_data->>'starts_at')::timestamptz,(p_data->>'rejoin_at')::timestamptz,p_data->>'rejoin_item_id');
  IF EXISTS(SELECT 1 FROM wm_calendar_activities WHERE branch_id=p_branch AND status='confirmed' AND (starts_at<(p_data->>'starts_at')::timestamptz OR ends_at>(p_data->>'rejoin_at')::timestamptz)) THEN RAISE EXCEPTION 'OUTSIDE_BRANCH_WINDOW'; END IF;
  UPDATE wm_calendar_branches SET source_item_id=p_data->>'source_item_id',starts_at=(p_data->>'starts_at')::timestamptz,rejoin_at=(p_data->>'rejoin_at')::timestamptz,rejoin_item_id=p_data->>'rejoin_item_id',rejoin_note=p_data->>'rejoin_note',needs_review=false WHERE branch_id=p_branch;
  UPDATE wm_calendar_branches SET needs_review=true WHERE parent_branch_id=p_branch AND status='confirmed' AND (starts_at<(p_data->>'starts_at')::timestamptz OR rejoin_at>(p_data->>'rejoin_at')::timestamptz);
 ELSIF p_kind='cancel' THEN
  WITH RECURSIVE subtree AS (SELECT branch_id FROM wm_calendar_branches WHERE branch_id=p_branch UNION ALL SELECT child.branch_id FROM wm_calendar_branches child JOIN subtree s ON child.parent_branch_id=s.branch_id)
  UPDATE wm_calendar_branches SET status='cancelled',revision=revision+1 WHERE branch_id IN (SELECT branch_id FROM subtree);
 ELSIF p_branch IS NOT NULL THEN
  IF p_kind='add' THEN
   v_id := 'act_'||replace(gen_random_uuid()::text,'-','');
   INSERT INTO wm_calendar_activities(item_id,branch_id,title,item_type,starts_at,ends_at,description,location)
    VALUES(v_id,p_branch,p_data->>'title',p_data->>'item_type',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,coalesce(p_data->>'description',''),coalesce(p_data->>'location',''));
  ELSIF p_kind='edit' THEN
   UPDATE wm_calendar_activities SET title=p_data->>'title',item_type=p_data->>'item_type',starts_at=(p_data->>'starts_at')::timestamptz,ends_at=(p_data->>'ends_at')::timestamptz,description=coalesce(p_data->>'description',''),location=coalesce(p_data->>'location','') WHERE item_id=p_item;
  ELSIF p_kind='remove' THEN UPDATE wm_calendar_activities SET status='removed' WHERE item_id=p_item;
  END IF;
 ELSE
  SELECT * INTO n FROM itineraries WHERE trip_id=p_trip AND is_active FOR UPDATE;
  SELECT timezone INTO tz FROM wm_trip_settings WHERE trip_id=p_trip;
  IF p_kind='add' THEN
   v_id := 'itm_'||replace(gen_random_uuid()::text,'-','');
   INSERT INTO itinerary_items(item_id,itinerary_id,day_index,sort_order,starts_at,ends_at,item_type,title,cost,currency,carbon_kg,duration_minutes,source,locked,status,created_at,updated_at)
   VALUES(v_id,n.itinerary_id,((p_data->>'starts_at')::timestamptz AT TIME ZONE tz)::date-(SELECT start_date FROM trips WHERE trip_id=p_trip)+1,
    coalesce((SELECT max(sort_order)+1 FROM itinerary_items WHERE itinerary_id=n.itinerary_id),1),(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,p_data->>'item_type',p_data->>'title',0,n.currency,0,ceil(extract(epoch FROM (p_data->>'ends_at')::timestamptz-(p_data->>'starts_at')::timestamptz)/60)::integer,'vote',false,'confirmed',now(),now());
   INSERT INTO wm_item_state(logical_item_id,itinerary_id,current_item_id,revision,decision_locked) VALUES('log_'||replace(gen_random_uuid()::text,'-',''),n.itinerary_id,v_id,1,true);
   INSERT INTO wm_cost_metadata(item_id,cost_basis,cost_state) VALUES(v_id,'unknown','unknown');
  ELSIF p_kind='edit' THEN
   UPDATE itinerary_items SET title=p_data->>'title',item_type=p_data->>'item_type',starts_at=(p_data->>'starts_at')::timestamptz,ends_at=(p_data->>'ends_at')::timestamptz,
    day_index=((p_data->>'starts_at')::timestamptz AT TIME ZONE tz)::date-(SELECT start_date FROM trips WHERE trip_id=p_trip)+1,
    duration_minutes=ceil(extract(epoch FROM (p_data->>'ends_at')::timestamptz-(p_data->>'starts_at')::timestamptz)/60)::integer,updated_at=now() WHERE item_id=p_item;
   UPDATE wm_item_state SET revision=revision+1,decision_locked=true WHERE current_item_id=p_item;
  ELSIF p_kind='remove' THEN UPDATE itinerary_items SET status='removed',updated_at=now() WHERE item_id=p_item;
   UPDATE wm_item_state SET revision=revision+1 WHERE current_item_id=p_item;
  END IF;
  IF p_kind IN ('add','edit') THEN
   INSERT INTO wm_calendar_item_details VALUES(v_id,coalesce(p_data->>'description',''),coalesce(p_data->>'location','')) ON CONFLICT(item_id) DO UPDATE SET description=excluded.description,location=excluded.location;
  END IF;
  INSERT INTO wm_item_revisions(item_revision_id,logical_item_id,revision,item_id,snapshot)
   SELECT 'rev_'||replace(gen_random_uuid()::text,'-',''),s.logical_item_id,s.revision,i.item_id,to_jsonb(i) FROM wm_item_state s JOIN itinerary_items i ON i.item_id=s.current_item_id WHERE i.item_id=v_id;
  UPDATE itineraries SET version=version+1,updated_at=now(),total_duration_minutes=(SELECT coalesce(sum(duration_minutes),0) FROM itinerary_items WHERE itinerary_id=n.itinerary_id AND status='confirmed') WHERE itinerary_id=n.itinerary_id;
 END IF;
 IF p_branch IS NOT NULL THEN UPDATE wm_calendar_branches SET revision=revision+1 WHERE branch_id=p_branch; END IF;
 RETURN v_id;
END $$;
