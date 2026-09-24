-- KV Hackathon 2026 · travel data model v1.1.0-rc1
-- Only the 14 tables this problem statement needs.

CREATE EXTENSION IF NOT EXISTS vector;   -- optional, for embedding search

-- currencies  (Reference & geography)
CREATE TABLE currencies (
  currency_id                  TEXT PRIMARY KEY,
  iso4217                      CHAR(3) NOT NULL UNIQUE,
  name                         TEXT NOT NULL,
  symbol                       TEXT NOT NULL,
  minor_unit_exponent          SMALLINT NOT NULL,
  display_locale               TEXT NOT NULL,
  updated_at                   TIMESTAMPTZ NOT NULL
);

-- languages  (Reference & geography)
CREATE TABLE languages (
  language_id                  TEXT PRIMARY KEY,
  bcp47                        TEXT NOT NULL UNIQUE,
  english_name                 TEXT NOT NULL,
  native_name                  TEXT NOT NULL,
  script                       TEXT NOT NULL,
  rtl                          BOOLEAN NOT NULL,
  tts_supported                BOOLEAN NOT NULL,
  updated_at                   TIMESTAMPTZ NOT NULL
);

-- countries  (Reference & geography)
CREATE TABLE countries (
  country_id                   TEXT PRIMARY KEY,
  iso2                         CHAR(2) NOT NULL UNIQUE,
  iso3                         CHAR(3) NOT NULL UNIQUE,
  name                         TEXT NOT NULL,
  default_currency             CHAR(3) NOT NULL,
  calling_code                 TEXT NOT NULL,
  region                       TEXT NOT NULL,
  updated_at                   TIMESTAMPTZ NOT NULL
);

-- cities  (Reference & geography)
CREATE TABLE cities (
  city_id                      TEXT PRIMARY KEY,
  name                         TEXT NOT NULL,
  state                        TEXT,
  country_id                   TEXT NOT NULL,
  country_code                 CHAR(2) NOT NULL,
  lat                          NUMERIC(9,6) NOT NULL,
  lng                          NUMERIC(9,6) NOT NULL,
  timezone                     TEXT NOT NULL,
  region                       TEXT NOT NULL,
  population                   INTEGER,
  season_profile               TEXT NOT NULL CHECK (season_profile IN ('winter', 'summer', 'monsoon', 'post_monsoon', 'spring', 'autumn')),
  peak_months                  TEXT NOT NULL,
  primary_language             TEXT NOT NULL,
  description                  TEXT,
  status                       TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived', 'draft')),
  updated_at                   TIMESTAMPTZ NOT NULL
);

-- tour_guides  (Supply & catalogue)
CREATE TABLE tour_guides (
  guide_id                     TEXT PRIMARY KEY,
  city_id                      TEXT NOT NULL,
  display_name                 TEXT NOT NULL,
  languages                    TEXT NOT NULL,
  specialisation               TEXT NOT NULL CHECK (specialisation IN ('heritage', 'food', 'trekking', 'wildlife', 'photography', 'religious', 'shopping', 'accessibility')),
  secondary_specialisation     TEXT CHECK (secondary_specialisation IN ('heritage', 'food', 'trekking', 'wildlife', 'photography', 'religious', 'shopping', 'accessibility')),
  years_experience             SMALLINT NOT NULL,
  rating                       NUMERIC(2,1),
  review_count                 INTEGER NOT NULL,
  day_rate                     NUMERIC(12,2) NOT NULL,
  half_day_rate                NUMERIC(12,2) NOT NULL,
  currency                     CHAR(3) NOT NULL,
  certified                    BOOLEAN NOT NULL,
  bio                          TEXT NOT NULL,
  status                       TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived', 'draft')),
  updated_at                   TIMESTAMPTZ NOT NULL
);

-- users  (Identity & preference)
CREATE TABLE users (
  user_id                      TEXT PRIMARY KEY,
  display_name                 TEXT NOT NULL,
  email                        TEXT NOT NULL UNIQUE,
  home_city_id                 TEXT NOT NULL,
  home_currency                CHAR(3) NOT NULL,
  locale                       TEXT NOT NULL,
  budget_band                  TEXT NOT NULL CHECK (budget_band IN ('shoestring', 'value', 'mid', 'premium', 'luxury')),
  travel_style                 TEXT NOT NULL CHECK (travel_style IN ('budget', 'comfort', 'luxury', 'adventure', 'slow', 'cultural', 'wellness')),
  traveller_type               TEXT NOT NULL CHECK (traveller_type IN ('solo', 'couple', 'family', 'business', 'friends', 'senior', 'backpacker')),
  segment                      TEXT NOT NULL CHECK (segment IN ('heavy', 'light', 'cold_start')),
  date_of_signup               DATE NOT NULL,
  loyalty_tier                 TEXT,
  status                       TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived', 'draft')),
  created_at                   TIMESTAMPTZ NOT NULL,
  updated_at                   TIMESTAMPTZ NOT NULL
);

-- trips  (Trip & itinerary)
CREATE TABLE trips (
  trip_id                      TEXT PRIMARY KEY,
  owner_user_id                TEXT NOT NULL,
  title                        TEXT NOT NULL,
  origin_city_id               TEXT,
  destination_city_id          TEXT NOT NULL,
  start_date                   DATE NOT NULL,
  end_date                     DATE NOT NULL,
  party_size                   SMALLINT NOT NULL,
  adults                       SMALLINT NOT NULL,
  children                     SMALLINT NOT NULL,
  trip_type                    TEXT NOT NULL CHECK (trip_type IN ('solo', 'couple', 'family', 'business', 'friends', 'senior', 'backpacker')),
  is_group_trip                BOOLEAN NOT NULL,
  status                       TEXT NOT NULL CHECK (status IN ('draft', 'planning', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  home_currency                CHAR(3) NOT NULL,
  notes                        TEXT,
  created_at                   TIMESTAMPTZ NOT NULL,
  updated_at                   TIMESTAMPTZ NOT NULL
);

-- user_interactions  (Signals & evaluation)
CREATE TABLE user_interactions (
  interaction_id               TEXT PRIMARY KEY,
  user_id                      TEXT NOT NULL,
  entity_type                  TEXT NOT NULL CHECK (entity_type IN ('hotel', 'room_type', 'rate_plan', 'flight', 'flight_fare', 'poi', 'package', 'package_component', 'guide', 'transfer', 'event', 'xr_scene')),
  entity_id                    TEXT NOT NULL,
  interaction_type             TEXT NOT NULL CHECK (interaction_type IN ('view', 'click', 'like', 'save', 'book', 'dismiss', 'share', 'search')),
  occurred_at                  TIMESTAMPTZ NOT NULL,
  dwell_seconds                INTEGER,
  position_in_list             SMALLINT,
  query_text                   TEXT,
  query_language               TEXT,
  channel                      TEXT NOT NULL CHECK (channel IN ('web', 'mobile_app', 'partner', 'call_centre', 'agent')),
  session_id                   TEXT NOT NULL,
  implicit_rating              NUMERIC(3,2)
);

-- user_preferences  (Identity & preference)
CREATE TABLE user_preferences (
  preference_id                TEXT PRIMARY KEY,
  user_id                      TEXT NOT NULL UNIQUE,
  preferred_languages          TEXT NOT NULL,
  guide_language               TEXT,
  interests                    TEXT NOT NULL,
  dietary_flags                TEXT,
  accessibility_needs          TEXT,
  preferred_currency           CHAR(3) NOT NULL,
  max_daily_budget             NUMERIC(12,2),
  max_daily_budget_currency    CHAR(3),
  pace                         TEXT NOT NULL,
  updated_at                   TIMESTAMPTZ NOT NULL
);

-- itineraries  (Trip & itinerary)
CREATE TABLE itineraries (
  itinerary_id                 TEXT PRIMARY KEY,
  trip_id                      TEXT NOT NULL,
  name                         TEXT NOT NULL,
  version                      INTEGER NOT NULL,
  is_active                    BOOLEAN NOT NULL,
  generated_by                 TEXT NOT NULL CHECK (generated_by IN ('user', 'ai_planner', 'optimizer', 'agent', 'vote', 'import')),
  total_cost                   NUMERIC(12,2) NOT NULL,
  currency                     CHAR(3) NOT NULL,
  total_duration_minutes       INTEGER NOT NULL,
  total_carbon_kg              NUMERIC(10,3) NOT NULL,
  optimizer_weights            TEXT,
  status                       TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived', 'draft')),
  created_at                   TIMESTAMPTZ NOT NULL,
  updated_at                   TIMESTAMPTZ NOT NULL
);

-- itinerary_items  (Trip & itinerary)
CREATE TABLE itinerary_items (
  item_id                      TEXT PRIMARY KEY,
  itinerary_id                 TEXT NOT NULL,
  day_index                    SMALLINT NOT NULL,
  sort_order                   SMALLINT NOT NULL,
  starts_at                    TIMESTAMPTZ,
  ends_at                      TIMESTAMPTZ,
  item_type                    TEXT NOT NULL CHECK (item_type IN ('hotel', 'flight', 'poi', 'package', 'guide', 'transfer', 'meal', 'free')),
  entity_type                  TEXT CHECK (entity_type IN ('hotel', 'room_type', 'rate_plan', 'flight', 'flight_fare', 'poi', 'package', 'package_component', 'guide', 'transfer', 'event', 'xr_scene')),
  entity_id                    TEXT,
  title                        TEXT NOT NULL,
  cost                         NUMERIC(12,2) NOT NULL,
  currency                     CHAR(3) NOT NULL,
  carbon_kg                    NUMERIC(8,3) NOT NULL,
  duration_minutes             INTEGER NOT NULL,
  source                       TEXT NOT NULL CHECK (source IN ('user', 'ai_planner', 'optimizer', 'agent', 'vote', 'import')),
  explanation                  TEXT,
  locked                       BOOLEAN NOT NULL,
  status                       TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed', 'removed', 'replaced')),
  created_at                   TIMESTAMPTZ NOT NULL,
  updated_at                   TIMESTAMPTZ NOT NULL
);

-- proposals  (Trip & itinerary)
CREATE TABLE proposals (
  proposal_id                  TEXT PRIMARY KEY,
  itinerary_id                 TEXT NOT NULL,
  proposed_by_user_id          TEXT NOT NULL,
  action                       TEXT NOT NULL,
  target_item_id               TEXT,
  entity_type                  TEXT CHECK (entity_type IN ('hotel', 'room_type', 'rate_plan', 'flight', 'flight_fare', 'poi', 'package', 'package_component', 'guide', 'transfer', 'event', 'xr_scene')),
  entity_id                    TEXT,
  title                        TEXT NOT NULL,
  rationale                    TEXT,
  cost_delta                   NUMERIC(12,2) NOT NULL,
  currency                     CHAR(3) NOT NULL,
  closes_at                    TIMESTAMPTZ NOT NULL,
  status                       TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'rejected', 'expired')),
  created_at                   TIMESTAMPTZ NOT NULL,
  updated_at                   TIMESTAMPTZ NOT NULL
);

-- trip_members  (Trip & itinerary)
CREATE TABLE trip_members (
  member_id                    TEXT PRIMARY KEY,
  trip_id                      TEXT NOT NULL,
  user_id                      TEXT NOT NULL,
  role                         TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at                    TIMESTAMPTZ NOT NULL,
  share_weight                 NUMERIC(6,3) NOT NULL,
  invited_by_user_id           TEXT,
  status                       TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived', 'draft')),
  updated_at                   TIMESTAMPTZ NOT NULL,
  UNIQUE (trip_id, user_id)
);

-- votes  (Trip & itinerary)
CREATE TABLE votes (
  vote_id                      TEXT PRIMARY KEY,
  proposal_id                  TEXT NOT NULL,
  user_id                      TEXT NOT NULL,
  value                        TEXT NOT NULL CHECK (value IN ('yes', 'no', 'abstain')),
  weight                       NUMERIC(4,2) NOT NULL,
  comment                      TEXT,
  cast_at                      TIMESTAMPTZ NOT NULL,
  updated_at                   TIMESTAMPTZ NOT NULL,
  UNIQUE (proposal_id, user_id)
);

-- foreign keys
ALTER TABLE countries ADD CONSTRAINT fk_countries_default_currency FOREIGN KEY (default_currency) REFERENCES currencies(iso4217);
ALTER TABLE cities ADD CONSTRAINT fk_cities_country_id FOREIGN KEY (country_id) REFERENCES countries(country_id);
ALTER TABLE cities ADD CONSTRAINT fk_cities_primary_language FOREIGN KEY (primary_language) REFERENCES languages(bcp47);
ALTER TABLE tour_guides ADD CONSTRAINT fk_tour_guides_city_id FOREIGN KEY (city_id) REFERENCES cities(city_id);
ALTER TABLE tour_guides ADD CONSTRAINT fk_tour_guides_currency FOREIGN KEY (currency) REFERENCES currencies(iso4217);
ALTER TABLE users ADD CONSTRAINT fk_users_home_city_id FOREIGN KEY (home_city_id) REFERENCES cities(city_id);
ALTER TABLE users ADD CONSTRAINT fk_users_home_currency FOREIGN KEY (home_currency) REFERENCES currencies(iso4217);
ALTER TABLE users ADD CONSTRAINT fk_users_locale FOREIGN KEY (locale) REFERENCES languages(bcp47);
ALTER TABLE trips ADD CONSTRAINT fk_trips_owner_user_id FOREIGN KEY (owner_user_id) REFERENCES users(user_id);
ALTER TABLE trips ADD CONSTRAINT fk_trips_origin_city_id FOREIGN KEY (origin_city_id) REFERENCES cities(city_id);
ALTER TABLE trips ADD CONSTRAINT fk_trips_destination_city_id FOREIGN KEY (destination_city_id) REFERENCES cities(city_id);
ALTER TABLE trips ADD CONSTRAINT fk_trips_home_currency FOREIGN KEY (home_currency) REFERENCES currencies(iso4217);
ALTER TABLE user_interactions ADD CONSTRAINT fk_user_interactions_user_id FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE user_interactions ADD CONSTRAINT fk_user_interactions_query_language FOREIGN KEY (query_language) REFERENCES languages(bcp47);
ALTER TABLE user_preferences ADD CONSTRAINT fk_user_preferences_user_id FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE user_preferences ADD CONSTRAINT fk_user_preferences_guide_language FOREIGN KEY (guide_language) REFERENCES languages(bcp47);
ALTER TABLE user_preferences ADD CONSTRAINT fk_user_preferences_preferred_currency FOREIGN KEY (preferred_currency) REFERENCES currencies(iso4217);
ALTER TABLE user_preferences ADD CONSTRAINT fk_user_preferences_max_daily_budget_currency FOREIGN KEY (max_daily_budget_currency) REFERENCES currencies(iso4217);
ALTER TABLE itineraries ADD CONSTRAINT fk_itineraries_trip_id FOREIGN KEY (trip_id) REFERENCES trips(trip_id);
ALTER TABLE itineraries ADD CONSTRAINT fk_itineraries_currency FOREIGN KEY (currency) REFERENCES currencies(iso4217);
ALTER TABLE itinerary_items ADD CONSTRAINT fk_itinerary_items_itinerary_id FOREIGN KEY (itinerary_id) REFERENCES itineraries(itinerary_id);
ALTER TABLE itinerary_items ADD CONSTRAINT fk_itinerary_items_currency FOREIGN KEY (currency) REFERENCES currencies(iso4217);
ALTER TABLE proposals ADD CONSTRAINT fk_proposals_itinerary_id FOREIGN KEY (itinerary_id) REFERENCES itineraries(itinerary_id);
ALTER TABLE proposals ADD CONSTRAINT fk_proposals_proposed_by_user_id FOREIGN KEY (proposed_by_user_id) REFERENCES users(user_id);
ALTER TABLE proposals ADD CONSTRAINT fk_proposals_target_item_id FOREIGN KEY (target_item_id) REFERENCES itinerary_items(item_id);
ALTER TABLE proposals ADD CONSTRAINT fk_proposals_currency FOREIGN KEY (currency) REFERENCES currencies(iso4217);
ALTER TABLE trip_members ADD CONSTRAINT fk_trip_members_trip_id FOREIGN KEY (trip_id) REFERENCES trips(trip_id);
ALTER TABLE trip_members ADD CONSTRAINT fk_trip_members_user_id FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE trip_members ADD CONSTRAINT fk_trip_members_invited_by_user_id FOREIGN KEY (invited_by_user_id) REFERENCES users(user_id);
ALTER TABLE votes ADD CONSTRAINT fk_votes_proposal_id FOREIGN KEY (proposal_id) REFERENCES proposals(proposal_id);
ALTER TABLE votes ADD CONSTRAINT fk_votes_user_id FOREIGN KEY (user_id) REFERENCES users(user_id);

-- indexes
CREATE INDEX idx_countries_default_currency ON countries(default_currency);
CREATE INDEX idx_cities_country_id ON cities(country_id);
CREATE INDEX idx_cities_primary_language ON cities(primary_language);
CREATE INDEX idx_tour_guides_city_id ON tour_guides(city_id);
CREATE INDEX idx_tour_guides_currency ON tour_guides(currency);
CREATE INDEX idx_users_home_city_id ON users(home_city_id);
CREATE INDEX idx_users_home_currency ON users(home_currency);
CREATE INDEX idx_users_locale ON users(locale);
CREATE INDEX idx_trips_owner_user_id ON trips(owner_user_id);
CREATE INDEX idx_trips_origin_city_id ON trips(origin_city_id);
CREATE INDEX idx_trips_destination_city_id ON trips(destination_city_id);
CREATE INDEX idx_trips_home_currency ON trips(home_currency);
CREATE INDEX idx_user_interactions_user_id ON user_interactions(user_id);
CREATE INDEX idx_user_interactions_query_language ON user_interactions(query_language);
CREATE INDEX idx_user_preferences_guide_language ON user_preferences(guide_language);
CREATE INDEX idx_user_preferences_preferred_currency ON user_preferences(preferred_currency);
CREATE INDEX idx_user_preferences_max_daily_budget_currency ON user_preferences(max_daily_budget_currency);
CREATE INDEX idx_itineraries_trip_id ON itineraries(trip_id);
CREATE INDEX idx_itineraries_currency ON itineraries(currency);
CREATE INDEX idx_itinerary_items_itinerary_id ON itinerary_items(itinerary_id);
CREATE INDEX idx_itinerary_items_currency ON itinerary_items(currency);
CREATE INDEX idx_proposals_itinerary_id ON proposals(itinerary_id);
CREATE INDEX idx_proposals_proposed_by_user_id ON proposals(proposed_by_user_id);
CREATE INDEX idx_proposals_target_item_id ON proposals(target_item_id);
CREATE INDEX idx_proposals_currency ON proposals(currency);
CREATE INDEX idx_trip_members_trip_id ON trip_members(trip_id);
CREATE INDEX idx_trip_members_user_id ON trip_members(user_id);
CREATE INDEX idx_trip_members_invited_by_user_id ON trip_members(invited_by_user_id);
CREATE INDEX idx_votes_proposal_id ON votes(proposal_id);
CREATE INDEX idx_votes_user_id ON votes(user_id);