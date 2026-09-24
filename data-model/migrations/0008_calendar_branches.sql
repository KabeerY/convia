-- Calendar paths are independent from the shared itinerary, but use the same
-- trip lock, authenticated command boundary, history and outbox notifications.
CREATE TABLE wm_calendar_branches (
 branch_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
 parent_branch_id text REFERENCES wm_calendar_branches(branch_id),
 organizer_id text NOT NULL REFERENCES users(user_id), title text NOT NULL,
 source_item_id text NOT NULL, rejoin_item_id text, rejoin_note text NOT NULL,
 starts_at timestamptz NOT NULL, rejoin_at timestamptz NOT NULL,
 depth integer NOT NULL CHECK(depth BETWEEN 1 AND 5), revision integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
 needs_review boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(rejoin_at > starts_at)
);
CREATE TABLE wm_calendar_members (
 branch_id text REFERENCES wm_calendar_branches(branch_id), user_id text REFERENCES users(user_id),
 PRIMARY KEY(branch_id,user_id)
);
CREATE TABLE wm_calendar_activities (
 item_id text PRIMARY KEY, branch_id text NOT NULL REFERENCES wm_calendar_branches(branch_id),
 title text NOT NULL, item_type text NOT NULL, description text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '',
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','removed')),
 CHECK(ends_at > starts_at)
);
CREATE TABLE wm_calendar_attendance (
 trip_id text NOT NULL REFERENCES trips(trip_id), item_id text NOT NULL, user_id text REFERENCES users(user_id),
 going boolean NOT NULL, PRIMARY KEY(item_id,user_id)
);
CREATE TABLE wm_calendar_proposals (
 proposal_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
 branch_id text REFERENCES wm_calendar_branches(branch_id), item_id text,
 author_id text NOT NULL REFERENCES users(user_id), kind text NOT NULL CHECK(kind IN ('add','edit','remove','cancel','review','question')),
 title text NOT NULL, payload jsonb NOT NULL, base_revision integer NOT NULL,
 revision integer NOT NULL DEFAULT 0, electorate text[] NOT NULL, threshold integer NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','committed','rejected','stale','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_calendar_votes (
 proposal_id text REFERENCES wm_calendar_proposals(proposal_id), user_id text REFERENCES users(user_id),
 vote text NOT NULL CHECK(vote IN ('yes','no')), PRIMARY KEY(proposal_id,user_id)
);
CREATE TABLE wm_calendar_replies (
 reply_id text PRIMARY KEY, proposal_id text NOT NULL REFERENCES wm_calendar_proposals(proposal_id),
 user_id text NOT NULL REFERENCES users(user_id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_calendar_recommendations (
 recommendation_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
 title text NOT NULL, description text NOT NULL, item_type text NOT NULL,
 duration_minutes integer NOT NULL CHECK(duration_minutes > 0), reason text NOT NULL,
 source text NOT NULL DEFAULT 'sample' CHECK(source IN ('sample','trippy'))
);
CREATE INDEX ON wm_calendar_branches(trip_id);
CREATE INDEX ON wm_calendar_activities(branch_id);
CREATE INDEX ON wm_calendar_proposals(trip_id);
CREATE INDEX ON wm_calendar_replies(proposal_id);
CREATE INDEX ON wm_calendar_attendance(trip_id);
CREATE INDEX ON wm_calendar_recommendations(trip_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['wm_calendar_branches','wm_calendar_members','wm_calendar_activities','wm_calendar_attendance','wm_calendar_proposals','wm_calendar_votes','wm_calendar_replies','wm_calendar_recommendations'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY command_owner ON %I TO convia_command_owner USING (true) WITH CHECK (true)',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO convia_command_owner',t);
 END LOOP;
END $$;

CREATE FUNCTION wm_calendar_seed_recommendations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO wm_calendar_recommendations VALUES
 ('rec_walk_'||NEW.trip_id,NEW.trip_id,'Explore the local neighbourhood','An easy walk with room for spontaneous stops.','poi',60,'A flexible break between bigger plans.','sample'),
 ('rec_meal_'||NEW.trip_id,NEW.trip_id,'Share a local meal','Choose a nearby place together.','meal',90,'Time for the whole group to reconnect.','sample'),
 ('rec_free_'||NEW.trip_id,NEW.trip_id,'A slow afternoon','Leave time for a café, reading or a small detour.','free',120,'An alternative for travellers who prefer a slower pace.','sample');
 RETURN NEW;
END $$;
CREATE TRIGGER wm_calendar_trip_seed AFTER INSERT ON trips FOR EACH ROW EXECUTE FUNCTION wm_calendar_seed_recommendations();
INSERT INTO wm_calendar_recommendations
 SELECT 'rec_'||v.key||'_'||t.trip_id,t.trip_id,v.title,v.description,v.kind,v.duration,v.reason,'sample'
 FROM trips t CROSS JOIN (VALUES
 ('walk','Explore the local neighbourhood','An easy walk with room for spontaneous stops.','poi',60,'A flexible break between bigger plans.'),
 ('meal','Share a local meal','Choose a nearby place together.','meal',90,'Time for the whole group to reconnect.'),
 ('free','A slow afternoon','Leave time for a café, reading or a small detour.','free',120,'An alternative for travellers who prefer a slower pace.')
 ) v(key,title,description,kind,duration,reason);

-- One normalized read model for source/rejoin validation, across both kinds of plan.
CREATE VIEW wm_calendar_items AS
 SELECT i.item_id,n.trip_id,NULL::text AS branch_id,i.title,i.item_type,
 i.starts_at,i.ends_at,i.status,''::text AS description,''::text AS location
 FROM itinerary_items i JOIN itineraries n USING(itinerary_id) WHERE n.is_active
 UNION ALL
 SELECT a.item_id,b.trip_id,a.branch_id,a.title,a.item_type,a.starts_at,a.ends_at,
 CASE WHEN b.status='cancelled' THEN 'removed' ELSE a.status END,a.description,a.location
 FROM wm_calendar_activities a JOIN wm_calendar_branches b USING(branch_id);
ALTER VIEW wm_calendar_items OWNER TO convia_command_owner;

CREATE FUNCTION wm_calendar_validate(p_trip text,p_branch text,p_kind text,p_item text,p_data jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b wm_calendar_branches%ROWTYPE; tz text; lo timestamptz; hi timestamptz; s timestamptz; e timestamptz;
BEGIN
 IF p_branch IS NOT NULL THEN
  SELECT * INTO b FROM wm_calendar_branches WHERE branch_id=p_branch AND trip_id=p_trip AND status='confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'BRANCH_NOT_FOUND'; END IF;
 END IF;
 IF p_kind IN ('edit','remove') AND NOT EXISTS(SELECT 1 FROM wm_calendar_items WHERE trip_id=p_trip AND item_id=p_item AND branch_id IS NOT DISTINCT FROM p_branch AND status='confirmed') THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
 IF p_kind NOT IN ('add','edit') THEN RETURN; END IF;
 s := (p_data->>'starts_at')::timestamptz; e := (p_data->>'ends_at')::timestamptz;
 SELECT timezone INTO tz FROM wm_trip_settings WHERE trip_id=p_trip;
 SELECT start_date::timestamp AT TIME ZONE tz,(end_date+1)::timestamp AT TIME ZONE tz INTO lo,hi FROM trips WHERE trip_id=p_trip;
 IF s IS NULL OR e IS NULL OR s>=e OR s<lo OR e>hi THEN RAISE EXCEPTION 'INVALID_ITEM_TIME'; END IF;
 IF p_branch IS NOT NULL AND (s<b.starts_at OR e>b.rejoin_at) THEN RAISE EXCEPTION 'OUTSIDE_BRANCH_WINDOW'; END IF;
 IF nullif(trim(p_data->>'title'),'') IS NULL OR length(p_data->>'title')>200 OR coalesce(p_data->>'item_type','') NOT IN ('hotel','flight','poi','package','guide','transfer','meal','free') THEN RAISE EXCEPTION 'INVALID_ITEM'; END IF;
END $$;

CREATE FUNCTION wm_calendar_validate_branch(p_trip text,p_parent text,p_source text,p_start timestamptz,p_rejoin timestamptz,p_target text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE par wm_calendar_branches%ROWTYPE; src wm_calendar_items%ROWTYPE; target wm_calendar_items%ROWTYPE; tz text; hi timestamptz;
BEGIN
 SELECT * INTO src FROM wm_calendar_items WHERE trip_id=p_trip AND item_id=p_source AND status='confirmed' AND branch_id IS NOT DISTINCT FROM p_parent;
 IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_NOT_FOUND'; END IF;
 IF p_start IS NULL OR p_rejoin IS NULL OR p_start<src.starts_at OR p_rejoin<=p_start THEN RAISE EXCEPTION 'INVALID_REJOIN'; END IF;
 SELECT timezone INTO tz FROM wm_trip_settings WHERE trip_id=p_trip;
 SELECT (end_date+1)::timestamp AT TIME ZONE tz INTO hi FROM trips WHERE trip_id=p_trip;
 IF p_rejoin>hi THEN RAISE EXCEPTION 'INVALID_REJOIN'; END IF;
 IF p_parent IS NOT NULL THEN
  SELECT * INTO par FROM wm_calendar_branches WHERE branch_id=p_parent AND trip_id=p_trip AND status='confirmed';
  IF NOT FOUND OR p_start<par.starts_at OR p_rejoin>par.rejoin_at THEN RAISE EXCEPTION 'OUTSIDE_BRANCH_WINDOW'; END IF;
 END IF;
 IF p_target IS NOT NULL THEN
  SELECT * INTO target FROM wm_calendar_items WHERE trip_id=p_trip AND item_id=p_target AND status='confirmed' AND branch_id IS NOT DISTINCT FROM p_parent;
  IF NOT FOUND OR target.starts_at<>p_rejoin THEN RAISE EXCEPTION 'INVALID_REJOIN'; END IF;
 END IF;
END $$;

CREATE FUNCTION wm_calendar_apply(p_actor text,p_trip text,p_branch text,p_kind text,p_item text,p_data jsonb) RETURNS text
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
  WITH RECURSIVE subtree AS (SELECT branch_id FROM wm_calendar_branches WHERE branch_id=p_branch UNION ALL SELECT b.branch_id FROM wm_calendar_branches b JOIN subtree s ON b.parent_branch_id=s.branch_id)
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
  INSERT INTO wm_item_revisions(item_revision_id,logical_item_id,revision,item_id,snapshot)
   SELECT 'rev_'||replace(gen_random_uuid()::text,'-',''),s.logical_item_id,s.revision,i.item_id,to_jsonb(i) FROM wm_item_state s JOIN itinerary_items i ON i.item_id=s.current_item_id WHERE i.item_id=v_id;
  UPDATE itineraries SET version=version+1,updated_at=now(),total_duration_minutes=(SELECT coalesce(sum(duration_minutes),0) FROM itinerary_items WHERE itinerary_id=n.itinerary_id AND status='confirmed') WHERE itinerary_id=n.itinerary_id;
 END IF;
 IF p_branch IS NOT NULL THEN UPDATE wm_calendar_branches SET revision=revision+1 WHERE branch_id=p_branch; END IF;
 RETURN v_id;
END $$;

CREATE FUNCTION wm_calendar_flag_connections() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.status IS DISTINCT FROM OLD.status THEN
  UPDATE wm_calendar_branches SET needs_review=true WHERE status='confirmed' AND (source_item_id=OLD.item_id OR rejoin_item_id=OLD.item_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wm_calendar_main_connection AFTER UPDATE ON itinerary_items FOR EACH ROW EXECUTE FUNCTION wm_calendar_flag_connections();
CREATE TRIGGER wm_calendar_branch_connection AFTER UPDATE ON wm_calendar_activities FOR EACH ROW EXECUTE FUNCTION wm_calendar_flag_connections();

CREATE FUNCTION wm_calendar_command(p_actor text,p_input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t text := p_input->>'trip_id'; a text := p_input->>'action'; role text;
 b wm_calendar_branches%ROWTYPE; parent wm_calendar_branches%ROWTYPE; q wm_calendar_proposals%ROWTYPE;
 item wm_calendar_items%ROWTYPE; bid text := p_input->>'branch_id'; iid text := p_input->>'item_id';
 pid text; kind text; data jsonb; rev integer; electorate text[]; yeses integer; nos integer; result jsonb;
BEGIN
 -- Match the existing decision writer's lock order for concurrency safety.
 PERFORM 1 FROM trips WHERE trip_id=t FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TRIP_NOT_FOUND'; END IF;
 PERFORM 1 FROM itineraries WHERE trip_id=t AND is_active FOR UPDATE;
 role := wm_member_role(p_actor,t);
 IF role IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED'; END IF;
 IF role='guest' THEN RAISE EXCEPTION 'DECISION_FORBIDDEN'; END IF;
 IF bid IS NOT NULL THEN
  SELECT * INTO b FROM wm_calendar_branches WHERE branch_id=bid AND trip_id=t AND status='confirmed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRANCH_NOT_FOUND'; END IF;
 END IF;
 IF a='branch.create' THEN
  bid := 'br_'||replace(gen_random_uuid()::text,'-','');
  IF p_input->>'parent_branch_id' IS NOT NULL THEN
   SELECT * INTO parent FROM wm_calendar_branches WHERE branch_id=p_input->>'parent_branch_id' AND trip_id=t AND status='confirmed';
   IF NOT FOUND THEN RAISE EXCEPTION 'BRANCH_NOT_FOUND'; END IF;
   IF parent.depth>=5 THEN RAISE EXCEPTION 'BRANCH_DEPTH_LIMIT'; END IF;
  END IF;
  PERFORM wm_calendar_validate_branch(t,p_input->>'parent_branch_id',p_input->>'source_item_id',(p_input->>'starts_at')::timestamptz,(p_input->>'rejoin_at')::timestamptz,p_input->>'rejoin_item_id');
  INSERT INTO wm_calendar_branches(branch_id,trip_id,parent_branch_id,organizer_id,title,source_item_id,rejoin_item_id,rejoin_note,starts_at,rejoin_at,depth)
  VALUES(bid,t,p_input->>'parent_branch_id',p_actor,p_input->>'title',p_input->>'source_item_id',p_input->>'rejoin_item_id',p_input->>'rejoin_note',(p_input->>'starts_at')::timestamptz,(p_input->>'rejoin_at')::timestamptz,coalesce(parent.depth,0)+1);
  INSERT INTO wm_calendar_members VALUES(bid,p_actor);
  result := jsonb_build_object('branch_id',bid);
 ELSIF a='branch.join' THEN
  IF (p_input->>'joining')::boolean THEN INSERT INTO wm_calendar_members VALUES(bid,p_actor) ON CONFLICT DO NOTHING;
  ELSE
   DELETE FROM wm_calendar_members WHERE user_id=p_actor AND branch_id IN (WITH RECURSIVE s AS (SELECT branch_id FROM wm_calendar_branches WHERE branch_id=bid UNION ALL SELECT c.branch_id FROM wm_calendar_branches c JOIN s ON c.parent_branch_id=s.branch_id) SELECT branch_id FROM s);
  END IF;
  -- Membership changes invalidate previously frozen branch electorates.
  UPDATE wm_calendar_branches SET revision=revision+1 WHERE branch_id=bid;
 ELSIF a='attendance' THEN
  SELECT * INTO item FROM wm_calendar_items WHERE item_id=iid AND trip_id=t AND status='confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
  IF item.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM wm_calendar_members WHERE branch_id=item.branch_id AND user_id=p_actor) THEN RAISE EXCEPTION 'BRANCH_MEMBERSHIP_REQUIRED'; END IF;
  INSERT INTO wm_calendar_attendance VALUES(t,iid,p_actor,(p_input->>'going')::boolean) ON CONFLICT(item_id,user_id) DO UPDATE SET going=excluded.going;
 ELSIF a IN ('change','branch.review','question') THEN
  kind := CASE WHEN a='branch.review' THEN 'review' WHEN a='question' THEN 'question' ELSE p_input->>'kind' END;
  IF kind='question' THEN
   SELECT * INTO item FROM wm_calendar_items WHERE item_id=iid AND trip_id=t AND status='confirmed';
   IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
   bid := item.branch_id;
   IF bid IS NOT NULL THEN SELECT * INTO b FROM wm_calendar_branches WHERE branch_id=bid; END IF;
  END IF;
  IF kind IN ('cancel','review') AND bid IS NULL THEN RAISE EXCEPTION 'BRANCH_NOT_FOUND'; END IF;
  IF bid IS NOT NULL AND p_actor<>b.organizer_id AND role NOT IN ('organizer','co_organizer') AND NOT EXISTS(SELECT 1 FROM wm_calendar_members WHERE branch_id=bid AND user_id=p_actor) THEN RAISE EXCEPTION 'BRANCH_MEMBERSHIP_REQUIRED'; END IF;
  IF bid IS NULL THEN SELECT version INTO rev FROM itineraries WHERE trip_id=t AND is_active; ELSE rev := b.revision; END IF;
  IF kind<>'question' AND (p_input->>'expected_revision')::integer IS DISTINCT FROM rev THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
  data := CASE WHEN kind='review' THEN p_input ELSE coalesce(p_input->'activity','{}'::jsonb) END;
  PERFORM wm_calendar_validate(t,bid,kind,iid,data);
  IF bid IS NULL OR kind='question' THEN
   SELECT array_agg(m.user_id) INTO electorate FROM trip_members m JOIN wm_member_permissions p USING(member_id) WHERE m.trip_id=t AND m.status='active' AND p.app_role<>'guest';
  ELSE
   SELECT array_agg(m.user_id) INTO electorate FROM wm_calendar_members m WHERE m.branch_id=bid AND wm_member_role(m.user_id,t) IS NOT NULL AND wm_member_role(m.user_id,t)<>'guest';
  END IF;
  electorate := coalesce(electorate,ARRAY[p_actor]);
  -- No one else is affected: organizer can edit a solo path directly.
  IF bid IS NOT NULL AND kind<>'question' AND (p_actor=b.organizer_id OR role IN ('organizer','co_organizer')) AND NOT EXISTS(SELECT 1 FROM unnest(electorate) u WHERE u<>p_actor) AND NOT EXISTS(SELECT 1 FROM wm_calendar_branches WHERE parent_branch_id=bid AND status='confirmed') THEN
   iid := wm_calendar_apply(p_actor,t,bid,kind,iid,data);
   result := jsonb_build_object('status','committed','item_id',iid);
  ELSE
   pid := 'cp_'||replace(gen_random_uuid()::text,'-','');
   INSERT INTO wm_calendar_proposals(proposal_id,trip_id,branch_id,item_id,author_id,kind,title,payload,base_revision,electorate,threshold)
   VALUES(pid,t,bid,iid,p_actor,kind,CASE WHEN kind='question' THEN p_input->>'body' ELSE initcap(kind)||' '||coalesce(data->>'title',b.title,(SELECT title FROM wm_calendar_items WHERE item_id=iid),'activity') END,data,rev,electorate,cardinality(electorate)/2+1);
   result := jsonb_build_object('proposal_id',pid,'status','open');
  END IF;
 ELSIF a IN ('vote','withdraw','reply') THEN
  pid := p_input->>'proposal_id';
  SELECT * INTO q FROM wm_calendar_proposals WHERE proposal_id=pid AND trip_id=t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DECISION_NOT_FOUND'; END IF;
  IF a='reply' THEN
   INSERT INTO wm_calendar_replies VALUES('cr_'||replace(gen_random_uuid()::text,'-',''),pid,p_actor,p_input->>'body',now());
  ELSIF a='withdraw' THEN
   IF q.author_id<>p_actor AND role NOT IN ('organizer','co_organizer') THEN RAISE EXCEPTION 'DECISION_FORBIDDEN'; END IF;
   IF q.status<>'open' THEN RAISE EXCEPTION 'DECISION_CLOSED'; END IF;
   UPDATE wm_calendar_proposals SET status='withdrawn',revision=revision+1 WHERE proposal_id=pid;
  ELSE
   IF NOT p_actor=ANY(q.electorate) THEN RAISE EXCEPTION 'DECISION_FORBIDDEN'; END IF;
   IF q.status<>'open' THEN RAISE EXCEPTION 'DECISION_CLOSED'; END IF;
   IF q.revision IS DISTINCT FROM (p_input->>'expected_revision')::integer THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
   IF q.branch_id IS NOT NULL THEN SELECT * INTO b FROM wm_calendar_branches WHERE branch_id=q.branch_id; rev := b.revision;
   ELSE SELECT version INTO rev FROM itineraries WHERE trip_id=t AND is_active; END IF;
   IF q.kind<>'question' AND (rev<>q.base_revision OR (q.branch_id IS NOT NULL AND b.status<>'confirmed')) THEN
    UPDATE wm_calendar_proposals SET status='stale',revision=revision+1 WHERE proposal_id=pid;
   ELSE
    INSERT INTO wm_calendar_votes VALUES(pid,p_actor,p_input->>'vote') ON CONFLICT(proposal_id,user_id) DO UPDATE SET vote=excluded.vote;
    UPDATE wm_calendar_proposals SET revision=revision+1 WHERE proposal_id=pid;
    -- Only branch activity ballots double as attendance, never question ballots.
    IF q.branch_id IS NOT NULL AND q.item_id IS NOT NULL AND q.kind IN ('edit','remove') THEN
     INSERT INTO wm_calendar_attendance VALUES(t,q.item_id,p_actor,p_input->>'vote'='yes') ON CONFLICT(item_id,user_id) DO UPDATE SET going=excluded.going;
    END IF;
    SELECT count(*) FILTER(WHERE vote='yes'),count(*) FILTER(WHERE vote='no') INTO yeses,nos FROM wm_calendar_votes WHERE proposal_id=pid;
    IF q.kind<>'question' AND yeses>=q.threshold THEN
     iid := wm_calendar_apply(p_actor,t,q.branch_id,q.kind,q.item_id,q.payload);
     IF q.branch_id IS NOT NULL AND q.kind='add' THEN
      INSERT INTO wm_calendar_attendance SELECT t,iid,user_id,vote='yes' FROM wm_calendar_votes WHERE proposal_id=pid ON CONFLICT(item_id,user_id) DO UPDATE SET going=excluded.going;
     END IF;
     UPDATE wm_calendar_proposals SET status='committed',item_id=coalesce(iid,item_id) WHERE proposal_id=pid;
    ELSIF q.kind<>'question' AND nos>cardinality(q.electorate)-q.threshold THEN UPDATE wm_calendar_proposals SET status='rejected' WHERE proposal_id=pid;
    END IF;
   END IF;
  END IF;
 ELSE RAISE EXCEPTION 'UNKNOWN_COMMAND';
 END IF;
 INSERT INTO wm_history_events(history_id,trip_id,event_kind,actor_user_id,detail) VALUES('his_'||replace(gen_random_uuid()::text,'-',''),t,'calendar.'||a,p_actor,jsonb_build_object('branch_id',coalesce(bid,q.branch_id),'item_id',iid,'proposal_id',pid,'kind',kind,'input',p_input,'result',result));
 PERFORM wm_emit(t,'calendar.changed',coalesce(pid,bid,iid,t));
 RETURN coalesce(result,jsonb_build_object('ok',true));
END $$;

CREATE FUNCTION wm_calendar_read(p_actor text,p_trip text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF wm_member_role(p_actor,p_trip) IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED'; END IF;
 SELECT jsonb_build_object('actor_id',p_actor,
  'branches',coalesce((SELECT jsonb_agg(to_jsonb(b)||jsonb_build_object('can_manage',b.organizer_id=p_actor OR wm_member_role(p_actor,p_trip) IN ('organizer','co_organizer'),
   'member_ids',coalesce((SELECT jsonb_agg(m.user_id) FROM wm_calendar_members m WHERE m.branch_id=b.branch_id AND wm_member_role(m.user_id,p_trip) IS NOT NULL),'[]'::jsonb))) FROM wm_calendar_branches b WHERE b.trip_id=p_trip AND b.status='confirmed'),'[]'::jsonb),
  'activities',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('attendee_ids',
   coalesce((SELECT jsonb_agg(m.user_id) FROM trip_members m WHERE m.trip_id=p_trip AND m.status='active'
    AND (i.branch_id IS NULL OR EXISTS(SELECT 1 FROM wm_calendar_members cm WHERE cm.branch_id=i.branch_id AND cm.user_id=m.user_id))
    AND coalesce((SELECT going FROM wm_calendar_attendance a WHERE a.item_id=i.item_id AND a.user_id=m.user_id),i.branch_id IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM wm_calendar_branches other JOIN wm_calendar_members om USING(branch_id)
     WHERE other.trip_id=p_trip AND other.status='confirmed' AND om.user_id=m.user_id AND other.branch_id IS DISTINCT FROM i.branch_id
      AND other.starts_at<i.ends_at AND other.rejoin_at>i.starts_at
      AND other.depth>coalesce((SELECT depth FROM wm_calendar_branches WHERE branch_id=i.branch_id),0))),'[]'::jsonb),
   'actor_going',(SELECT going FROM wm_calendar_attendance a WHERE a.item_id=i.item_id AND a.user_id=p_actor)))
   FROM wm_calendar_items i WHERE i.trip_id=p_trip AND i.status='confirmed'),'[]'::jsonb),
  'proposals',coalesce((SELECT jsonb_agg(to_jsonb(q)||jsonb_build_object(
   'can_vote',p_actor=ANY(q.electorate),'can_withdraw',q.author_id=p_actor OR wm_member_role(p_actor,p_trip) IN ('organizer','co_organizer'),
   'yes_count',(SELECT count(*) FROM wm_calendar_votes v WHERE v.proposal_id=q.proposal_id AND vote='yes'),
   'no_count',(SELECT count(*) FROM wm_calendar_votes v WHERE v.proposal_id=q.proposal_id AND vote='no'),
   'actor_ballot',(SELECT vote FROM wm_calendar_votes v WHERE v.proposal_id=q.proposal_id AND user_id=p_actor),
   'replies',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('display_name',u.display_name) ORDER BY r.created_at) FROM wm_calendar_replies r JOIN users u USING(user_id) WHERE r.proposal_id=q.proposal_id),'[]'::jsonb)) ORDER BY q.created_at DESC)
   FROM wm_calendar_proposals q WHERE q.trip_id=p_trip),'[]'::jsonb),
  'recommendations',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM wm_calendar_recommendations r WHERE r.trip_id=p_trip),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;

DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY[
 'wm_calendar_seed_recommendations()',
 'wm_calendar_validate(text,text,text,text,jsonb)',
 'wm_calendar_validate_branch(text,text,text,timestamp with time zone,timestamp with time zone,text)',
 'wm_calendar_apply(text,text,text,text,text,jsonb)',
 'wm_calendar_flag_connections()',
 'wm_calendar_command(text,jsonb)', 'wm_calendar_read(text,text)'] LOOP
 EXECUTE 'ALTER FUNCTION '||f||' OWNER TO convia_command_owner';
 EXECUTE 'REVOKE ALL ON FUNCTION '||f||' FROM PUBLIC';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION wm_calendar_command(text,jsonb),wm_calendar_read(text,text) TO convia_runtime;
