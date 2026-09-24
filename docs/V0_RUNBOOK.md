# Convia V0 — live runbook

This is the normal Convia application, not a separate demo mode. The browser
uses Supabase Auth; Core uses hosted Supabase Postgres. No local database is
required or used.

## One-time setup

1. Put `CORE_DATABASE_URL` and `MIGRATION_DATABASE_URL` from the hosted
   Supabase project's **Connect** panel in the ignored root `.env`. For the
   sprint they may be the same working Postgres connection string. Keep the
   public Supabase URL and publishable key in `.env` too; the browser's Vite
   equivalents belong in `frontend/.env.local`. Never put a database URL or
   `GEMINI_API_KEY` in a `VITE_` variable.
2. From `backend/core-api`, run:

   ```sh
   node --env-file-if-exists=../../.env --import tsx src/db/migrate.ts
   node --env-file-if-exists=../../.env --import tsx src/db/seed.ts
   ```

3. Sign in to Convia once as the intended trip organiser. This maps that
   Supabase Auth account to a Convia user. Then run:

   ```sh
   node --env-file-if-exists=../../.env --import tsx src/db/seed-v0.ts
   ```

   `V0_SEED_OWNER_EMAIL` in root `.env` selects a specific signed-in organiser;
   otherwise a mapped team account is preferred. The script is idempotent: it
   creates ten public, joinable trip records with plans and trip profiles once.
   Two supplied sample users may join each as non-voting guests; real signed-in
   members can join and vote. In the current hosted V0 data, Akhin owns the ten
   fixtures and Harsh is their second voting member.

4. Start Core from `backend/core-api`:

   ```sh
   node --env-file-if-exists=../../.env --import tsx --watch src/server.ts
   ```

   Start the existing Vite frontend on port 4175. `GET /ready` on Core should
   return 200; a 503 is not a successful V0 boot.
   If you replace the template `GEMINI_API_KEY` in root `.env`, restart Core
   so the running process reads the new value.

## Demo proof, with two browser accounts

Use two real Supabase Auth users. One creates a trip or opens a seeded trip;
the second joins via an open group or invite. In both browsers, verify:

1. Open the same trip room and its Calendar. Propose an activity. A locked
   item cannot change directly by dragging; a drag makes a move proposal.
2. Vote in the Decision Room. Until the threshold passes, the calendar is
   unchanged. After approval, both browsers show the same next plan version.
3. Fork a moment: Path A stays, Path B is proposed. Vote; after approval the
   calendar shows both paths and a rejoin marker.
4. Send a chat message and confirm it appears in the second browser. Tag
   `@Trippy` to request a proposal. Without `GEMINI_API_KEY`, the chat states
   that Trippy is not configured; with a valid key, it may prepare a proposal
   but cannot cast votes or commit a plan.
5. Save a Passport; in Discover, filter by destination/date/capacity first,
   then inspect the ordered groups and the Group Genome's anchors, tensions,
   and unknowns. No missing preference becomes a fake mismatch.

If a migration or seed step fails, stop and fix it before claiming the demo is
live. Do not replace the shared database with browser-local cards.
