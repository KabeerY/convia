#!/usr/bin/env node
// Face grouping end-to-end test.
// Usage: pnpm --filter @convia/core-api face:e2e [photo-dir]
//   (photo dir is relative to the repo root; default ../../face-test)
//
// Layout:
//   ./face-test/
//     kabir/ref.jpg        <- one clear selfie per person (folder = handle)
//     akin/ref.jpg
//     harsh/ref.jpg
//     album/*.jpg          <- end-of-trip group photos
//
// What it does, all through the real HTTP API:
//   1. creates one Supabase user per handle (email_confirm via admin API)
//   2. first user creates a trip, invites the rest via a real invite code
//   3. everyone enrolls their ref.jpg as a face reference (consent: true)
//   4. first user uploads every album photo
//   5. waits for every media job, then prints the grouping + confidences
//
// Test accounts look like <handle>.<timestamp>@gmail.com and are left in the
// shared project; delete them from the Supabase dashboard when done.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const API = process.env.CORE_INTERNAL_URL ?? "http://localhost:4000";
const stamp = Date.now().toString(36);

const root = process.argv[2] ?? "../../face-test";
const handles = readdirSync(root).filter((entry) => {
  try {
    return statSync(join(root, entry)).isDirectory() && entry !== "album";
  } catch {
    return false;
  }
});
if (handles.length === 0) {
  console.error(`no person folders in ${root} (expected <handle>/ref.jpg + album/)`);
  process.exit(2);
}
const albumDir = join(root, "album");
const albumFiles = readdirSync(albumDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
if (albumFiles.length === 0) {
  console.error(`no photos in ${albumDir}`);
  process.exit(2);
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const pub = (email) =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });

function extOf(file) {
  if (/\.png$/i.test(file)) return "image/png";
  if (/\.webp$/i.test(file)) return "image/webp";
  return "image/jpeg";
}

async function api(path, token, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(payload)?.slice(0, 300)}`);
  return payload;
}

async function waitForJob(token, jobId, label) {
  for (let i = 0; i < 60; i += 1) {
    const job = await api(`/v1/jobs/${jobId}`, token);
    if (job.state === "succeeded") return job;
    if (job.state === "failed")
      throw new Error(`${label}: job ${jobId} failed (${job.result_reference ?? "no reason"})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${label}: job ${jobId} still not done after 2 minutes`);
}

// --- 1. users ---
const users = [];
for (const handle of handles) {
  const email = `${handle}.${stamp}@gmail.com`;
  const { error } = await admin.auth.admin.createUser({
    email,
    password: "testpass123",
    email_confirm: true,
    user_metadata: { full_name: handle },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const { data, error: signErr } = await pub().auth.signInWithPassword({
    email,
    password: "testpass123",
  });
  if (signErr) throw new Error(`signIn ${email}: ${signErr.message}`);
  users.push({ handle, email, token: data.session.access_token });
  console.log(`user ${handle} <${email}>`);
}

// --- 2. trip + invites ---
const owner = users[0];
const trip = await api("/v1/trips", owner.token, {
  method: "POST",
  body: {
    title: `Face test ${stamp}`,
    destination_city_id: "cty_c07454f1",
    start_date: "2026-10-01",
    end_date: "2026-10-03",
    capacity: 10,
    visibility: "private",
    admission_policy: "invite_only",
  },
});
console.log(`trip ${trip.trip_id}`);
const invite = await api(`/v1/trips/${trip.trip_id}/invites`, owner.token, {
  method: "POST",
  body: {
    target_role: "participant",
    max_uses: 10,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
});
for (const member of users.slice(1)) {
  await api("/v1/invites/redeem", member.token, {
    method: "POST",
    body: { trip_id: trip.trip_id, code: invite.code },
  });
  console.log(`${member.handle} joined`);
}

// --- 3. reference selfies ---
const refJobs = [];
for (const member of users) {
  const refPath = join(root, member.handle, "ref.jpg");
  const image = readFileSync(refPath).toString("base64");
  const created = await api(`/v1/trips/${trip.trip_id}/face-references`, member.token, {
    method: "POST",
    body: { image_base64: image, content_type: extOf(refPath), consent: true },
  });
  console.log(`${member.handle} enrolled (${created.media_id}${created.duplicate ? ", duplicate" : ""})`);
  if (!created.duplicate) refJobs.push([`${member.handle} enroll`, member.token, created.job_id]);
}

// --- 4. album uploads ---
const albumJobs = [];
for (const file of albumFiles) {
  const image = readFileSync(join(albumDir, file)).toString("base64");
  const created = await api(`/v1/trips/${trip.trip_id}/media`, owner.token, {
    method: "POST",
    body: { image_base64: image, content_type: extOf(file) },
  });
  if (!created.duplicate) albumJobs.push([file, owner.token, created.job_id]);
}
console.log(`${albumJobs.length} album photos queued (${albumFiles.length - albumJobs.length} duplicates)`);

// --- 5. wait + report ---
for (const [label, token, jobId] of [...refJobs, ...albumJobs]) {
  await waitForJob(token, jobId, label);
  console.log(`done: ${label}`);
}
const people = await api(`/v1/trips/${trip.trip_id}/face-matches`, owner.token);
console.log("\n== grouping ==");
for (const person of people.people ?? []) {
  const photos = await api(
    `/v1/trips/${trip.trip_id}/face-matches?subject_user_id=${person.subject_user_id}`,
    owner.token,
  );
  const confs = (photos.photos ?? []).map((p) => `${basename(p.media_id)}:${p.confidence?.toFixed(2)}`).join(" ");
  console.log(`${person.display_name}: ${person.photo_count} photos  ${confs}`);
}
const unassigned = await api(`/v1/trips/${trip.trip_id}/face-matches?unassigned=true`, owner.token);
console.log(`unassigned faces: ${(unassigned.faces ?? []).length}`);
console.log(`\nTRIP=${trip.trip_id} (open the Memories tab to see it)`);
