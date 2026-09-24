-- Keep calendar revisions consistent and invalidate ancestor proposals on nesting.
CREATE OR REPLACE FUNCTION wm_calendar_command(p_actor text,p_input jsonb) RETURNS jsonb
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
  -- A new descendant changes who is affected by an ancestor cancellation.
  WITH RECURSIVE ancestors AS (SELECT branch_id,parent_branch_id FROM wm_calendar_branches WHERE branch_id=p_input->>'parent_branch_id' UNION ALL SELECT p.branch_id,p.parent_branch_id FROM wm_calendar_branches p JOIN ancestors a ON a.parent_branch_id=p.branch_id)
  UPDATE wm_calendar_branches SET revision=revision+1 WHERE branch_id IN (SELECT branch_id FROM ancestors);
  result := jsonb_build_object('branch_id',bid);
 ELSIF a='branch.join' THEN
  IF (p_input->>'joining')::boolean THEN INSERT INTO wm_calendar_members VALUES(bid,p_actor) ON CONFLICT DO NOTHING;
  ELSE
   DELETE FROM wm_calendar_members WHERE user_id=p_actor AND branch_id IN (WITH RECURSIVE s AS (SELECT branch_id FROM wm_calendar_branches WHERE branch_id=bid UNION ALL SELECT c.branch_id FROM wm_calendar_branches c JOIN s ON c.parent_branch_id=s.branch_id) SELECT branch_id FROM s);
  END IF;
  -- Joining/leaving affects ancestor cancellation proposals and descendant electorates.
  WITH RECURSIVE ancestors AS (SELECT branch_id,parent_branch_id FROM wm_calendar_branches WHERE branch_id=bid UNION ALL SELECT p.branch_id,p.parent_branch_id FROM wm_calendar_branches p JOIN ancestors a ON a.parent_branch_id=p.branch_id),
  descendants AS (SELECT branch_id FROM wm_calendar_branches WHERE branch_id=bid UNION ALL SELECT c.branch_id FROM wm_calendar_branches c JOIN descendants d ON c.parent_branch_id=d.branch_id)
  UPDATE wm_calendar_branches SET revision=revision+1 WHERE branch_id IN (SELECT branch_id FROM ancestors UNION SELECT branch_id FROM descendants);

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
  IF kind='review' THEN
   PERFORM wm_calendar_validate_branch(t,b.parent_branch_id,data->>'source_item_id',(data->>'starts_at')::timestamptz,(data->>'rejoin_at')::timestamptz,data->>'rejoin_item_id');
   IF EXISTS(SELECT 1 FROM wm_calendar_activities WHERE branch_id=bid AND status='confirmed' AND (starts_at<(data->>'starts_at')::timestamptz OR ends_at>(data->>'rejoin_at')::timestamptz)) THEN RAISE EXCEPTION 'OUTSIDE_BRANCH_WINDOW'; END IF;
  END IF;
  IF bid IS NULL OR kind='question' THEN
   SELECT array_agg(m.user_id) INTO electorate FROM trip_members m JOIN wm_member_permissions p USING(member_id) WHERE m.trip_id=t AND m.status='active' AND p.app_role<>'guest';
  ELSE
   SELECT array_agg(m.user_id) INTO electorate FROM wm_calendar_members m WHERE m.branch_id=bid AND wm_member_role(m.user_id,t) IS NOT NULL AND wm_member_role(m.user_id,t)<>'guest';
  END IF;
  IF bid IS NOT NULL AND kind='cancel' THEN
   WITH RECURSIVE subtree AS (SELECT branch_id FROM wm_calendar_branches WHERE branch_id=bid UNION ALL SELECT c.branch_id FROM wm_calendar_branches c JOIN subtree s ON c.parent_branch_id=s.branch_id)
   SELECT array_agg(DISTINCT m.user_id) INTO electorate FROM wm_calendar_members m WHERE m.branch_id IN (SELECT branch_id FROM subtree) AND wm_member_role(m.user_id,t) IS NOT NULL AND wm_member_role(m.user_id,t)<>'guest';
  END IF;
  electorate := coalesce(electorate,ARRAY[p_actor]);
  IF bid IS NOT NULL AND kind<>'question' AND NOT b.organizer_id=ANY(electorate) AND wm_member_role(b.organizer_id,t) IS NOT NULL THEN electorate := array_append(electorate,b.organizer_id); END IF;
  IF bid IS NOT NULL AND role IN ('organizer','co_organizer') AND NOT p_actor=ANY(electorate) THEN electorate := array_append(electorate,p_actor); END IF;
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
    IF q.kind<>'question' AND yeses>=q.threshold AND (q.branch_id IS NULL OR EXISTS(SELECT 1 FROM wm_calendar_votes v WHERE v.proposal_id=pid AND vote='yes' AND (v.user_id=b.organizer_id OR wm_member_role(v.user_id,t) IN ('organizer','co_organizer')))) THEN
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

CREATE OR REPLACE FUNCTION wm_calendar_read(p_actor text,p_trip text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF wm_member_role(p_actor,p_trip) IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED'; END IF;
 SELECT jsonb_build_object('actor_id',p_actor,'version',(SELECT version FROM itineraries WHERE trip_id=p_trip AND is_active),
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
   'status',CASE WHEN q.status='open' AND q.kind<>'question' AND q.base_revision IS DISTINCT FROM CASE WHEN q.branch_id IS NULL THEN (SELECT version FROM itineraries WHERE trip_id=p_trip AND is_active) ELSE (SELECT revision FROM wm_calendar_branches WHERE branch_id=q.branch_id) END THEN 'stale' ELSE q.status END,
   'can_reply',wm_member_role(p_actor,p_trip)<>'guest','can_vote',p_actor=ANY(q.electorate) AND wm_member_role(p_actor,p_trip)<>'guest','can_withdraw',q.author_id=p_actor OR wm_member_role(p_actor,p_trip) IN ('organizer','co_organizer'),
   'yes_count',(SELECT count(*) FROM wm_calendar_votes v WHERE v.proposal_id=q.proposal_id AND vote='yes'),
   'no_count',(SELECT count(*) FROM wm_calendar_votes v WHERE v.proposal_id=q.proposal_id AND vote='no'),
   'actor_ballot',(SELECT vote FROM wm_calendar_votes v WHERE v.proposal_id=q.proposal_id AND user_id=p_actor),
   'replies',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('display_name',u.display_name) ORDER BY r.created_at) FROM wm_calendar_replies r JOIN users u USING(user_id) WHERE r.proposal_id=q.proposal_id),'[]'::jsonb)) ORDER BY q.created_at DESC)
   FROM wm_calendar_proposals q WHERE q.trip_id=p_trip),'[]'::jsonb),
  'recommendations',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM wm_calendar_recommendations r WHERE r.trip_id=p_trip),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;
