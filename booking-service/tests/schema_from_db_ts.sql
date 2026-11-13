-- COPIED VERBATIM from backend/src/db.ts lines 13-57 (the CREATE TABLE block) at commit 8aaa453.
-- Re-copy it whenever db.ts changes: the tests must run against the schema Express really creates.
-- Do not edit by hand. booking-service never runs this outside tests; db.ts owns the real schema.

CREATE TABLE IF NOT EXISTS travellers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, age INTEGER, gender TEXT NOT NULL,
  home_city TEXT, home_airport TEXT, interests TEXT NOT NULL, gender_preference TEXT NOT NULL,
  is_seed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES travellers(id),
  city TEXT NOT NULL, check_in TEXT NOT NULL, check_out TEXT NOT NULL, max_size INTEGER NOT NULL,
  budget_inr INTEGER NOT NULL, itinerary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id), traveller_id TEXT NOT NULL REFERENCES travellers(id),
  position INTEGER NOT NULL, joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, traveller_id)
);
CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, traveller_id TEXT NOT NULL REFERENCES travellers(id),
  home_city TEXT, city TEXT NOT NULL, check_in TEXT NOT NULL, check_out TEXT NOT NULL,
  budget_inr INTEGER NOT NULL, interests TEXT NOT NULL, gender TEXT NOT NULL, gender_preference TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL REFERENCES groups(id),
  seeker_id TEXT NOT NULL REFERENCES travellers(id), search_id INTEGER REFERENCES searches(id),
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','CLOSED')),
  score INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), decided_at TEXT
);
CREATE TABLE IF NOT EXISTS saved_options (
  group_id TEXT NOT NULL REFERENCES groups(id), traveller_id TEXT NOT NULL REFERENCES travellers(id),
  room_id TEXT NOT NULL, rooms INTEGER NOT NULL, total_inr INTEGER NOT NULL, per_member_inr REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, traveller_id, room_id)
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL UNIQUE REFERENCES groups(id),
  hotel_id TEXT NOT NULL, room_id TEXT NOT NULL, rooms INTEGER NOT NULL, nights TEXT NOT NULL,
  total_inr INTEGER NOT NULL, shares TEXT NOT NULL, booked_by TEXT NOT NULL REFERENCES travellers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL REFERENCES groups(id),
  traveller_id TEXT NOT NULL REFERENCES travellers(id), body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
