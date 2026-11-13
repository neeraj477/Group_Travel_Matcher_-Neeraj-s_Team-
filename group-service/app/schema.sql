-- Catalog (from data/catalog). Read-only after seeding.

CREATE TABLE IF NOT EXISTS cities (
    name         TEXT PRIMARY KEY,
    country      TEXT NOT NULL,
    country_code TEXT NOT NULL,
    timezone     TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS interests (
    interest TEXT PRIMARY KEY,
    label    TEXT NOT NULL,
    category TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS hotels (
    hotel_id TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    city     TEXT NOT NULL REFERENCES cities(name),
    area     TEXT NOT NULL,
    rating   REAL NOT NULL CHECK (rating >= 0 AND rating <= 10),
    stars    INTEGER NOT NULL CHECK (stars > 0),
    image    TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS rooms (
    room_id             TEXT PRIMARY KEY,
    hotel_id            TEXT NOT NULL REFERENCES hotels(hotel_id),
    room_type           TEXT NOT NULL CHECK (room_type IN
                            ('SINGLE', 'TWIN', 'DOUBLE', 'TRIPLE', 'FAMILY', 'FAMILY_SUITE')),
    name                TEXT NOT NULL,
    max_adults          INTEGER NOT NULL CHECK (max_adults > 0),
    price_per_night_inr INTEGER NOT NULL CHECK (price_per_night_inr > 0),
    refundable          INTEGER NOT NULL CHECK (refundable IN (0, 1))
) STRICT;

CREATE TABLE IF NOT EXISTS availability (
    room_id    TEXT NOT NULL REFERENCES rooms(room_id),
    date       TEXT NOT NULL,
    rooms_left INTEGER NOT NULL CHECK (rooms_left >= 0),
    PRIMARY KEY (room_id, date)
) STRICT;

-- App data. Seeded from data/problem-3, then written by the app; seeding never overwrites it.

CREATE TABLE IF NOT EXISTS travellers (
    traveller_id      TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    age               INTEGER NOT NULL CHECK (age > 0),
    gender            TEXT NOT NULL CHECK (gender IN ('FEMALE', 'MALE')),
    home_city         TEXT NOT NULL,
    gender_preference TEXT NOT NULL CHECK (gender_preference IN ('ANY', 'SAME_GENDER')),
    created_at        TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS traveller_interests (
    traveller_id TEXT NOT NULL REFERENCES travellers(traveller_id),
    interest     TEXT NOT NULL REFERENCES interests(interest),
    PRIMARY KEY (traveller_id, interest)
) STRICT;

-- Named trip_groups because GROUPS is an SQLite keyword.
-- No status column: FULL and BOOKED are derived from members and bookings, so they cannot drift.
CREATE TABLE IF NOT EXISTS trip_groups (
    group_id   TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    owner_id   TEXT NOT NULL REFERENCES travellers(traveller_id),
    city       TEXT NOT NULL REFERENCES cities(name),
    check_in   TEXT NOT NULL,
    check_out  TEXT NOT NULL,
    max_size   INTEGER NOT NULL,
    budget_inr INTEGER NOT NULL CHECK (budget_inr > 0),
    itinerary  TEXT NOT NULL,
    created_at TEXT NOT NULL,
    -- Last line of defence: an impossible stay is rejected even if a route forgets to validate.
    CHECK (check_out > check_in)
) STRICT;

CREATE TABLE IF NOT EXISTS group_members (
    group_id     TEXT NOT NULL REFERENCES trip_groups(group_id),
    traveller_id TEXT NOT NULL REFERENCES travellers(traveller_id),
    joined_at    TEXT NOT NULL,
    PRIMARY KEY (group_id, traveller_id)
) STRICT;
