import pg from "pg";

// Idempotent, real Supabase/Postgres trip fixtures. Run only after a team member
// has signed in once so wm_auth_identities contains an actual organiser.
const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString)
  throw new Error("MIGRATION_DATABASE_URL is required for Supabase seed");
const city = {
  Manali: "cty_9327d518",
  Panaji: "cty_43d0a650",
  Gokarna: "cty_a97c33ad",
  Aurangabad: "cty_f29656ff",
  Mumbai: "cty_95e7c8ca",
  Bengaluru: "cty_17b8ef2f",
};
type Activity = [string, string, number, number, number];
type Seed = {
  key: string;
  title: string;
  city: keyof typeof city;
  description: string;
  interests: string[];
  pace: string;
  budget: string;
  admission: string;
  activities: Activity[];
};
const trips: Seed[] = [
  {
    key: "manali-adventure",
    title: "Manali · mountains with room to wander",
    city: "Manali",
    description:
      "Mountain air, a little courage, and a slower afternoon for anyone who wants it.",
    interests: ["Adventure", "Nature", "Food"],
    pace: "balanced",
    budget: "mid",
    admission: "open",
    activities: [
      ["Old Manali café morning", "meal", 1, 10, 1],
      ["Solang Valley paragliding", "poi", 2, 9, 2],
      ["Riverside dinner", "meal", 2, 19, 2],
    ],
  },
  {
    key: "panaji-food",
    title: "Panaji · food, colour & coast",
    city: "Panaji",
    description:
      "A relaxed Goa weekend built around food walks, art and coastal evenings.",
    interests: ["Food", "Culture", "Photography"],
    pace: "relaxed",
    budget: "mid",
    admission: "open",
    activities: [
      ["Fontainhas heritage walk", "poi", 1, 10, 2],
      ["Local seafood lunch", "meal", 1, 13, 1],
      ["Mandovi sunset cruise", "poi", 2, 17, 2],
    ],
  },
  {
    key: "gokarna-nature",
    title: "Gokarna · beaches beyond the rush",
    city: "Gokarna",
    description: "Beach trails and quiet mornings with a small group.",
    interests: ["Nature", "Adventure", "Wellness"],
    pace: "balanced",
    budget: "value",
    admission: "open",
    activities: [
      ["Om Beach sunrise", "poi", 1, 7, 2],
      ["Coastal trail", "poi", 2, 9, 3],
      ["Beachside dinner", "meal", 2, 19, 2],
    ],
  },
  {
    key: "aurangabad-history",
    title: "Aurangabad · caves & stories",
    city: "Aurangabad",
    description:
      "A curious, unhurried route through architecture and local history.",
    interests: ["History", "Culture", "Photography"],
    pace: "balanced",
    budget: "value",
    admission: "open",
    activities: [
      ["Ajanta Caves", "poi", 1, 9, 3],
      ["Maharashtrian thali", "meal", 1, 14, 1],
      ["Ellora morning", "poi", 2, 9, 3],
    ],
  },
  {
    key: "mumbai-food",
    title: "Mumbai · the city after dark",
    city: "Mumbai",
    description: "Street food, neighbourhoods and the city’s night energy.",
    interests: ["Food", "Nightlife", "Culture"],
    pace: "active",
    budget: "mid",
    admission: "open",
    activities: [
      ["Colaba neighbourhood walk", "poi", 1, 11, 2],
      ["Kala Ghoda cafés", "meal", 1, 15, 1],
      ["Night food trail", "meal", 2, 20, 2],
    ],
  },
  {
    key: "bengaluru-weekend",
    title: "Bengaluru · a creative city break",
    city: "Bengaluru",
    description: "Parks, coffee and little discoveries across the city.",
    interests: ["Food", "Culture", "Nature"],
    pace: "relaxed",
    budget: "mid",
    admission: "open",
    activities: [
      ["Cubbon Park stroll", "poi", 1, 8, 2],
      ["Coffee and conversation", "meal", 1, 11, 1],
      ["Local art evening", "poi", 2, 17, 2],
    ],
  },
  {
    key: "manali-slow",
    title: "Manali · slow mountain mornings",
    city: "Manali",
    description: "For people who want the mountains without a packed schedule.",
    interests: ["Nature", "Wellness", "Photography"],
    pace: "relaxed",
    budget: "premium",
    admission: "approval",
    activities: [
      ["Mountain-view breakfast", "meal", 1, 9, 1],
      ["Forest walk", "poi", 1, 11, 2],
      ["Sunset viewpoint", "poi", 2, 17, 2],
    ],
  },
  {
    key: "panaji-wellness",
    title: "Goa · reset by the sea",
    city: "Panaji",
    description: "Wellness mornings and generous free time by the coast.",
    interests: ["Wellness", "Nature", "Food"],
    pace: "relaxed",
    budget: "premium",
    admission: "open",
    activities: [
      ["Morning yoga", "poi", 1, 8, 1],
      ["Beach brunch", "meal", 1, 11, 1],
      ["Open coastal afternoon", "free", 2, 15, 2],
    ],
  },
  {
    key: "mumbai-photo",
    title: "Mumbai · streets through a lens",
    city: "Mumbai",
    description: "A photography-first city walk for curious travellers.",
    interests: ["Photography", "Culture", "History"],
    pace: "active",
    budget: "value",
    admission: "approval",
    activities: [
      ["Gateway of India at dawn", "poi", 1, 7, 2],
      ["Heritage street frames", "poi", 1, 11, 2],
      ["Evening skyline", "poi", 2, 17, 2],
    ],
  },
  {
    key: "gokarna-adventure",
    title: "Gokarna · trail to tide",
    city: "Gokarna",
    description: "A more active beach trip with hikes and wide-open evenings.",
    interests: ["Adventure", "Nature", "Photography"],
    pace: "active",
    budget: "shoestring",
    admission: "open",
    activities: [
      ["Kudle Beach walk", "poi", 1, 8, 2],
      ["Half Moon Beach trek", "poi", 2, 9, 3],
      ["Bonfire evening", "poi", 2, 19, 2],
    ],
  },
];
const dateAfter = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const localTime = (day: string, hour: number) =>
  `${day}T${String(hour).padStart(2, "0")}:00:00+05:30`;

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('convia_v0_seed'))",
  );
  const ownerQuery = process.env.V0_SEED_OWNER_EMAIL
    ? await client.query<{ user_id: string }>(
        "SELECT i.user_id FROM wm_auth_identities i JOIN users u USING(user_id) WHERE lower(u.email)=lower($1) LIMIT 1",
        [process.env.V0_SEED_OWNER_EMAIL],
      )
    : await client.query<{ user_id: string }>(
        "SELECT i.user_id FROM wm_auth_identities i JOIN users u USING(user_id) WHERE u.status='active' ORDER BY CASE WHEN lower(u.display_name) IN ('akhin','harsh','kabeer','y kabeer') THEN 0 ELSE 1 END,i.created_at LIMIT 1",
      );
  const owner = ownerQuery.rows[0]?.user_id;
  if (!owner)
    throw new Error(
      "Sign in to Convia once, then rerun db:seed-v0. Set V0_SEED_OWNER_EMAIL if you want a specific organiser.",
    );
  const others = (
    await client.query<{ user_id: string }>(
      "SELECT i.user_id FROM wm_auth_identities i JOIN users u USING(user_id) WHERE i.user_id<>$1 AND u.status='active' AND lower(u.display_name) IN ('akhin','harsh','kabeer','y kabeer') ORDER BY i.created_at LIMIT 2",
      [owner],
    )
  ).rows.map((row) => row.user_id);
  // Supplied sample users appear as guests, never as fake voting accounts.
  const sampleGuests = (
    await client.query<{ user_id: string }>(
      "SELECT u.user_id FROM users u WHERE u.status='active' AND u.user_id<>$1 AND NOT EXISTS (SELECT 1 FROM wm_auth_identities i WHERE i.user_id=u.user_id) ORDER BY u.user_id LIMIT 2",
      [owner],
    )
  ).rows.map((row) => row.user_id);
  for (const [index, seed] of trips.entries()) {
    const existing = await client.query(
      "SELECT trip_id FROM wm_v0_seeded_trips WHERE seed_key=$1",
      [seed.key],
    );
    if (existing.rows.length) {
      console.log(`Already seeded: ${seed.key}`);
      continue;
    }
    const start = dateAfter(7 + index * 3),
      end = dateAfter(9 + index * 3);
    const created = await client.query<{ value: { trip_id: string } }>(
      "SELECT wm_trip_command($1,'trip.create',$2::jsonb) AS value",
      [
        owner,
        JSON.stringify({
          title: seed.title,
          destination_city_id: city[seed.city],
          start_date: start,
          end_date: end,
          capacity: 7,
          visibility: "public",
          admission_policy: seed.admission,
          description: seed.description,
          timezone: "Asia/Kolkata",
          home_currency: "INR",
        }),
      ],
    );
    const tripId = created.rows[0].value.trip_id;
    await client.query(
      "INSERT INTO wm_v0_trip_profiles(trip_id,interests,pace,budget_band) VALUES($1,$2,$3,$4)",
      [tripId, seed.interests, seed.pace, seed.budget],
    );
    for (const [title, itemType, dayIndex, hour, length] of seed.activities) {
      const activityDate =
        dayIndex === 1 ? start : dateAfter(7 + index * 3 + dayIndex - 1);
      const active = await client.query<{ version: number }>(
        "SELECT version FROM itineraries WHERE trip_id=$1 AND is_active",
        [tripId],
      );
      const opened = await client.query<{
        value: { change_set_id: string; revision: number };
      }>(
        "SELECT wm_decision_command($1,'decision.publish',$2::jsonb) AS value",
        [
          owner,
          JSON.stringify({
            trip_id: tripId,
            base_itinerary_version: active.rows[0].version,
            title: `Add ${title}`,
            operations: [
              {
                action: "add",
                new_item: {
                  title,
                  item_type: itemType,
                  day_index: dayIndex,
                  starts_at: localTime(activityDate, hour),
                  ends_at: localTime(activityDate, hour + length),
                },
                cost_basis: "unknown",
              },
            ],
          }),
        ],
      );
      await client.query(
        "SELECT wm_decision_command($1,'decision.vote',$2::jsonb)",
        [
          owner,
          JSON.stringify({
            change_set_id: opened.rows[0].value.change_set_id,
            vote: "yes",
            expected_revision: opened.rows[0].value.revision,
          }),
        ],
      );
    }
    for (const person of others)
      await client.query("SELECT wm_admit($1,$2,'participant',$3)", [
        person,
        tripId,
        owner,
      ]);
    for (const person of sampleGuests)
      await client.query("SELECT wm_admit($1,$2,'guest',$3)", [
        person,
        tripId,
        owner,
      ]);
    await client.query(
      "INSERT INTO wm_v0_seeded_trips(seed_key,trip_id) VALUES($1,$2)",
      [seed.key, tripId],
    );
    console.log(`Seeded ${seed.title}: ${tripId}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
