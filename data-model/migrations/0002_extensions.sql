-- Additive Convia records. Canonical tables and columns are left unchanged.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'convia_command_owner') THEN
    CREATE ROLE convia_command_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'convia_runtime') THEN
    CREATE ROLE convia_runtime NOLOGIN;
  END IF;
END $$;
GRANT USAGE, CREATE ON SCHEMA public TO convia_command_owner;
GRANT USAGE ON SCHEMA public TO convia_runtime;
GRANT convia_command_owner TO postgres;

CREATE TABLE wm_auth_identities (
  auth_subject uuid PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES users(user_id),
  provider text NOT NULL DEFAULT 'supabase',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_profile_field_state (
  user_id text NOT NULL REFERENCES users(user_id), field text NOT NULL,
  source text NOT NULL CHECK (source IN ('explicit_form','user_confirmed_extraction','unconfirmed_inference','system_default')),
  confirmed boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','members','public')),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, field)
);
CREATE TABLE wm_trip_settings (
  trip_id text PRIMARY KEY REFERENCES trips(trip_id),
  visibility text NOT NULL CHECK (visibility IN ('public','private')),
  capacity smallint NOT NULL CHECK (capacity BETWEEN 1 AND 200),
  admission_policy text NOT NULL CHECK (admission_policy IN ('open','approval','invite_only')),
  timezone text NOT NULL,
  description text,
  cover_url text,
  expected_budget_basis text NOT NULL DEFAULT 'unknown' CHECK (expected_budget_basis IN ('person','party','unknown')),
  travel_style text,
  public_preview_version integer NOT NULL DEFAULT 1,
  role_policy_version integer NOT NULL DEFAULT 1,
  access_epoch bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_member_permissions (
  member_id text PRIMARY KEY REFERENCES trip_members(member_id),
  app_role text NOT NULL CHECK (app_role IN ('organizer','co_organizer','participant','guest')),
  can_manage_admission boolean NOT NULL DEFAULT false,
  can_manage_members boolean NOT NULL DEFAULT false,
  can_manage_settings boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_invites (
  invite_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  code_hash bytea NOT NULL UNIQUE, issued_by_user_id text NOT NULL REFERENCES users(user_id),
  target_role text NOT NULL CHECK (target_role IN ('participant','guest')),
  expires_at timestamptz NOT NULL, max_uses integer NOT NULL CHECK (max_uses > 0),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0), revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (use_count <= max_uses)
);
CREATE INDEX wm_invites_trip_idx ON wm_invites(trip_id);
CREATE TABLE wm_join_requests (
  request_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  requester_user_id text NOT NULL REFERENCES users(user_id), introduction text,
  state text NOT NULL CHECK (state IN ('pending','accepted','declined','withdrawn','expired')),
  reviewer_user_id text REFERENCES users(user_id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX wm_join_requests_active_idx ON wm_join_requests(trip_id,requester_user_id) WHERE state = 'pending';
CREATE INDEX wm_join_requests_trip_idx ON wm_join_requests(trip_id,state);
CREATE TABLE wm_member_removals (
  trip_id text NOT NULL REFERENCES trips(trip_id), user_id text NOT NULL REFERENCES users(user_id),
  removed_by_user_id text NOT NULL REFERENCES users(user_id), removed_at timestamptz NOT NULL DEFAULT now(),
  cleared_by_user_id text REFERENCES users(user_id), cleared_at timestamptz,
  PRIMARY KEY (trip_id,user_id)
);

CREATE TABLE wm_passports (
  passport_id text PRIMARY KEY, user_id text NOT NULL UNIQUE REFERENCES users(user_id),
  schema_version integer NOT NULL, revision integer NOT NULL DEFAULT 1,
  confirmed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_trip_passports (
  trip_passport_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  user_id text NOT NULL REFERENCES users(user_id), schema_version integer NOT NULL,
  revision integer NOT NULL DEFAULT 1, overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trip_id,user_id)
);
CREATE TABLE wm_genome_snapshots (
  genome_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  source_revision text NOT NULL, distributions jsonb NOT NULL, public_projection jsonb NOT NULL,
  member_projection jsonb NOT NULL, generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_match_results (
  result_id text PRIMARY KEY, actor_user_id text NOT NULL REFERENCES users(user_id),
  candidate_trip_id text NOT NULL REFERENCES trips(trip_id), score_version text NOT NULL,
  factors jsonb NOT NULL, coverage numeric(5,4) NOT NULL, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_discovery_events (
  event_id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(user_id),
  trip_id text REFERENCES trips(trip_id), event_kind text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wm_change_sets (
  change_set_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  itinerary_id text NOT NULL REFERENCES itineraries(itinerary_id),
  initiator_user_id text NOT NULL REFERENCES users(user_id), actor_kind text NOT NULL,
  base_itinerary_version integer NOT NULL, status text NOT NULL,
  approval_threshold integer NOT NULL, closes_at timestamptz NOT NULL,
  payload_hash text NOT NULL, committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wm_change_sets_open_deadline_idx ON wm_change_sets(closes_at) WHERE status = 'open';
CREATE TABLE wm_decision_entries (
  entry_id text PRIMARY KEY, change_set_id text NOT NULL REFERENCES wm_change_sets(change_set_id),
  proposal_id text NOT NULL UNIQUE REFERENCES proposals(proposal_id),
  ordinal integer NOT NULL, payload jsonb NOT NULL, expected_target_revision integer,
  UNIQUE(change_set_id,ordinal)
);
CREATE TABLE wm_electorate (
  change_set_id text NOT NULL REFERENCES wm_change_sets(change_set_id),
  user_id text NOT NULL REFERENCES users(user_id), role_snapshot text NOT NULL,
  PRIMARY KEY(change_set_id,user_id)
);
CREATE TABLE wm_ballots (
  change_set_id text NOT NULL REFERENCES wm_change_sets(change_set_id),
  user_id text NOT NULL REFERENCES users(user_id), value text NOT NULL CHECK (value IN ('yes','no','abstain')),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(change_set_id,user_id)
);
CREATE TABLE wm_ballot_events (
  ballot_event_id text PRIMARY KEY, change_set_id text NOT NULL REFERENCES wm_change_sets(change_set_id),
  user_id text NOT NULL REFERENCES users(user_id), value text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_item_state (
  logical_item_id text PRIMARY KEY, itinerary_id text NOT NULL REFERENCES itineraries(itinerary_id),
  current_item_id text REFERENCES itinerary_items(item_id), revision integer NOT NULL,
  decision_locked boolean NOT NULL DEFAULT false,
  latest_change_set_id text REFERENCES wm_change_sets(change_set_id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_item_revisions (
  item_revision_id text PRIMARY KEY, logical_item_id text NOT NULL REFERENCES wm_item_state(logical_item_id),
  revision integer NOT NULL, item_id text REFERENCES itinerary_items(item_id),
  prior_item_id text REFERENCES itinerary_items(item_id), snapshot jsonb NOT NULL,
  change_set_id text REFERENCES wm_change_sets(change_set_id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(logical_item_id,revision)
);
CREATE TABLE wm_history_events (
  history_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  logical_item_id text, change_set_id text, event_kind text NOT NULL,
  actor_user_id text REFERENCES users(user_id), detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wm_history_trip_idx ON wm_history_events(trip_id,occurred_at);
CREATE TABLE wm_commit_records (
  change_set_id text PRIMARY KEY REFERENCES wm_change_sets(change_set_id),
  committed_itinerary_version integer NOT NULL, committed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wm_trip_sequences (
  trip_id text PRIMARY KEY REFERENCES trips(trip_id), next_sequence bigint NOT NULL DEFAULT 1
);
CREATE TABLE wm_outbox (
  event_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  sequence bigint NOT NULL, kind text NOT NULL, resource_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz, UNIQUE(trip_id,sequence)
);
CREATE INDEX wm_outbox_pending_idx ON wm_outbox(occurred_at) WHERE delivered_at IS NULL;
CREATE TABLE wm_jobs (
  job_id text PRIMARY KEY, queue text NOT NULL, job_type text NOT NULL,
  payload_version integer NOT NULL, payload jsonb NOT NULL, dedupe_key text NOT NULL UNIQUE,
  state text NOT NULL, attempts integer NOT NULL DEFAULT 0,
  lease_owner text, lease_expires_at timestamptz, lease_generation bigint NOT NULL DEFAULT 0,
  next_retry_at timestamptz, result_reference text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wm_jobs_claim_idx ON wm_jobs(queue,state,next_retry_at);
CREATE TABLE wm_idempotency (
  actor_user_id text NOT NULL REFERENCES users(user_id), route text NOT NULL,
  idempotency_key text NOT NULL, request_hash text NOT NULL,
  response_reference text, status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_user_id,route,idempotency_key)
);

CREATE TABLE wm_branches (
  branch_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  owner_user_id text NOT NULL REFERENCES users(user_id), branch_type text NOT NULL,
  base_itinerary_version integer NOT NULL, draft_revision integer NOT NULL DEFAULT 1,
  visibility text NOT NULL, status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_branch_items (
  branch_item_id text PRIMARY KEY, branch_id text NOT NULL REFERENCES wm_branches(branch_id),
  payload jsonb NOT NULL, ordinal integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id,ordinal)
);
CREATE TABLE wm_branch_members (
  branch_id text NOT NULL REFERENCES wm_branches(branch_id), user_id text NOT NULL REFERENCES users(user_id),
  PRIMARY KEY(branch_id,user_id)
);
CREATE TABLE wm_reunions (
  reunion_id text PRIMARY KEY, branch_id text NOT NULL REFERENCES wm_branches(branch_id),
  meeting_at timestamptz NOT NULL, meeting_place_id text, accepted_change_set_id text REFERENCES wm_change_sets(change_set_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_cost_metadata (
  item_id text PRIMARY KEY REFERENCES itinerary_items(item_id),
  cost_basis text NOT NULL CHECK (cost_basis IN ('party','person','unknown')),
  cost_state text NOT NULL CHECK (cost_state IN ('known','estimated','unknown','free')),
  evidence jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_cost_allocations (
  item_id text NOT NULL REFERENCES itinerary_items(item_id), user_id text NOT NULL REFERENCES users(user_id),
  amount numeric(12,2) NOT NULL, currency char(3) NOT NULL REFERENCES currencies(iso4217),
  PRIMARY KEY(item_id,user_id)
);

CREATE TABLE wm_conversations (
  conversation_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  kind text NOT NULL CHECK (kind IN ('trip_group','private_enquiry')),
  created_by_user_id text NOT NULL REFERENCES users(user_id), status text NOT NULL DEFAULT 'active',
  next_sequence bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_conversation_members (
  conversation_id text NOT NULL REFERENCES wm_conversations(conversation_id),
  user_id text NOT NULL REFERENCES users(user_id), status text NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE wm_messages (
  message_id text PRIMARY KEY, conversation_id text NOT NULL REFERENCES wm_conversations(conversation_id),
  sender_user_id text REFERENCES users(user_id), agent_run_id text, content_kind text NOT NULL,
  body text NOT NULL, client_message_id text NOT NULL,
  conversation_sequence bigint NOT NULL, change_set_id text REFERENCES wm_change_sets(change_set_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id,client_message_id), UNIQUE(conversation_id,conversation_sequence)
);
CREATE TABLE wm_notifications (
  notification_id text PRIMARY KEY, recipient_user_id text NOT NULL REFERENCES users(user_id),
  event_kind text NOT NULL, resource_id text NOT NULL, read_at timestamptz,
  delivery_state text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wm_location_grants (
  grant_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  owner_user_id text NOT NULL REFERENCES users(user_id), recipient_scope jsonb NOT NULL,
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_locations (
  grant_id text PRIMARY KEY REFERENCES wm_location_grants(grant_id),
  lat numeric(9,6) NOT NULL, lng numeric(9,6) NOT NULL, accuracy_m numeric(10,2) NOT NULL,
  observed_at timestamptz NOT NULL, client_sequence bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_emergency_contacts (
  contact_id text PRIMARY KEY, owner_user_id text NOT NULL REFERENCES users(user_id),
  ciphertext bytea NOT NULL, nonce bytea NOT NULL, key_version integer NOT NULL,
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_contact_requests (
  request_id text PRIMARY KEY, contact_id text NOT NULL REFERENCES wm_emergency_contacts(contact_id),
  requester_user_id text NOT NULL REFERENCES users(user_id), purpose text NOT NULL,
  state text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE TABLE wm_contact_grants (
  grant_id text PRIMARY KEY, contact_id text NOT NULL REFERENCES wm_emergency_contacts(contact_id),
  recipient_user_id text NOT NULL REFERENCES users(user_id), expires_at timestamptz NOT NULL,
  revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_check_ins (
  check_in_id text PRIMARY KEY, owner_user_id text NOT NULL REFERENCES users(user_id),
  trip_id text NOT NULL REFERENCES trips(trip_id), expected_at timestamptz NOT NULL,
  state text NOT NULL, confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_reports (
  report_id text PRIMARY KEY, reporter_user_id text NOT NULL REFERENCES users(user_id),
  target_user_id text REFERENCES users(user_id), trip_id text REFERENCES trips(trip_id),
  category text NOT NULL, evidence jsonb, status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_blocks (
  blocker_user_id text NOT NULL REFERENCES users(user_id), blocked_user_id text NOT NULL REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(blocker_user_id,blocked_user_id),
  CHECK(blocker_user_id <> blocked_user_id)
);

CREATE TABLE wm_media (
  media_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  uploader_user_id text NOT NULL REFERENCES users(user_id), object_key text NOT NULL UNIQUE,
  checksum text NOT NULL, content_type text NOT NULL, byte_size bigint NOT NULL,
  status text NOT NULL, consent_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wm_media_trip_idx ON wm_media(trip_id,status);
CREATE TABLE wm_media_jobs (
  media_job_id text PRIMARY KEY, media_id text NOT NULL REFERENCES wm_media(media_id),
  job_id text NOT NULL UNIQUE REFERENCES wm_jobs(job_id), kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_face_references (
  reference_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  subject_user_id text NOT NULL REFERENCES users(user_id), media_id text NOT NULL REFERENCES wm_media(media_id),
  consented_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_face_embeddings (
  embedding_id text PRIMARY KEY, reference_id text NOT NULL REFERENCES wm_face_references(reference_id),
  model_version text NOT NULL, encrypted_vector bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_face_matches (
  match_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  media_id text NOT NULL REFERENCES wm_media(media_id), reference_id text NOT NULL REFERENCES wm_face_references(reference_id),
  confidence numeric(5,4), review_state text NOT NULL DEFAULT 'candidate',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_collages (
  collage_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  requested_by_user_id text NOT NULL REFERENCES users(user_id),
  selection jsonb NOT NULL, layout jsonb NOT NULL, output_object_key text,
  status text NOT NULL, job_id text REFERENCES wm_jobs(job_id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_agent_runs (
  run_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
  initiator_user_id text NOT NULL REFERENCES users(user_id),
  model_version text, prompt_version text, scope jsonb NOT NULL,
  status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wm_tool_calls (
  tool_call_id text PRIMARY KEY, run_id text NOT NULL REFERENCES wm_agent_runs(run_id),
  tool_name text NOT NULL, dedupe_key text NOT NULL,
  redacted_arguments jsonb NOT NULL, result_reference text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,dedupe_key)
);

-- Supabase's generated Data API must not expose canonical or extension rows.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
DO $$ DECLARE table_name text; BEGIN
  FOR table_name IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY convia_command_owner_access ON public.%I TO convia_command_owner USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO convia_command_owner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO convia_command_owner;
