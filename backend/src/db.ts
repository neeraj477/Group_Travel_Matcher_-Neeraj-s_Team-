// Our own data (profiles, posts, memberships, requests, saves, bookings, chat) lives in SQLite.
// The 24 travellers and 12 groups from the data pack are copied in once, on first start.
import Database from "better-sqlite3";
import path from "node:path";
import { seedGroups, seedTravellers } from "./catalog";

export const DB_PATH = process.env.DB_PATH ?? path.resolve(__dirname, "../../app.db");
export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
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
`);

const count = (db.prepare("SELECT COUNT(*) n FROM travellers").get() as { n: number }).n;
if (count === 0) {
  db.transaction(() => {
    const insT = db.prepare(`INSERT INTO travellers (id,name,age,gender,home_city,home_airport,interests,gender_preference,is_seed)
      VALUES (?,?,?,?,?,?,?,?,1)`);
    for (const t of seedTravellers)
      insT.run(t.traveller_id, t.name, t.age, t.gender, t.home_city, t.home_airport, JSON.stringify(t.interests), t.gender_preference);
    const insG = db.prepare(`INSERT INTO groups (id,name,owner_id,city,check_in,check_out,max_size,budget_inr,itinerary)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const insM = db.prepare("INSERT INTO group_members (group_id,traveller_id,position) VALUES (?,?,?)");
    for (const g of seedGroups) {
      insG.run(g.group_id, g.name, g.owner_id, g.city, g.check_in, g.check_out, g.max_size, g.budget_inr, g.itinerary);
      g.member_ids.forEach((m, i) => insM.run(g.group_id, m, i));
    }
  })();
}

// ---------- row helpers ----------
export interface Traveller {
  id: string; name: string; age: number | null; gender: "FEMALE" | "MALE"; home_city: string | null;
  home_airport: string | null; interests: string[]; gender_preference: "ANY" | "SAME_GENDER";
}
export interface Group {
  id: string; name: string; owner_id: string; city: string; check_in: string; check_out: string;
  max_size: number; budget_inr: number; itinerary: string; member_ids: string[];
}

export function getTraveller(id: string): Traveller | undefined {
  const r = db.prepare("SELECT * FROM travellers WHERE id = ?").get(id) as any;
  return r ? { ...r, interests: JSON.parse(r.interests) } : undefined;
}
export function listTravellers(): Traveller[] {
  return (db.prepare("SELECT * FROM travellers ORDER BY id").all() as any[]).map((r) => ({ ...r, interests: JSON.parse(r.interests) }));
}
export function memberIds(groupId: string): string[] {
  return (db.prepare("SELECT traveller_id FROM group_members WHERE group_id = ? ORDER BY position").all(groupId) as any[]).map((r) => r.traveller_id);
}
export function getGroup(id: string): Group | undefined {
  const r = db.prepare("SELECT * FROM groups WHERE id = ?").get(id) as any;
  return r ? { ...r, member_ids: memberIds(id) } : undefined;
}
export function listGroups(): Group[] {
  return (db.prepare("SELECT * FROM groups ORDER BY created_at, id").all() as any[]).map((r) => ({ ...r, member_ids: memberIds(r.id) }));
}
export function getBooking(groupId: string) {
  const r = db.prepare("SELECT * FROM bookings WHERE group_id = ?").get(groupId) as any;
  return r ? { ...r, nights: JSON.parse(r.nights), shares: JSON.parse(r.shares) } : undefined;
}
