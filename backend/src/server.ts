import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import crypto from "node:crypto";
import { cities, cityByName, departureCities, IMAGES_DIR, interests, roomById, hotelById } from "./catalog";
import { db, getBooking, getGroup, getTraveller, listGroups, listTravellers, USERNAME_RE, usernameTaken, type Group, type Traveller } from "./db";
import {
  evaluate, score, suggestFix, validateInterests, validateTrip, ValidationError, nightList, nightsBetween,
  sharedNights, budgetRange, WINDOW_START, WINDOW_END, type SeekerSearch,
} from "./rules";
import { bookedRooms, hotelOptions, priceRoom, splitShares } from "./hotels";
import { costPreview, type QuoteCache } from "./pricing";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/images", express.static(IMAGES_DIR));

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
  try { const out = fn(req, res); if (out !== undefined) res.json(out); } catch (e) { next(e); }
};

// Identity is just "which traveller am I" (M1 allows a name-only identity); the frontend sends it in a header.
function me(req: Request): Traveller {
  const id = req.header("x-traveller-id");
  const t = id ? getTraveller(id) : undefined;
  if (!t) throw new HttpError(401, "Sign up or pick your profile first.");
  return t;
}
function groupOr404(id: string): Group {
  const g = getGroup(id);
  if (!g) throw new HttpError(404, "Group not found.");
  return g;
}
function requireMember(g: Group, t: Traveller) {
  if (!g.member_ids.includes(t.id)) throw new HttpError(403, "Only group members can do this.");
}
const profile = (t: Traveller) => ({ id: t.id, username: t.username, name: t.name, age: t.age, gender: t.gender, home_city: t.home_city, interests: t.interests, gender_preference: t.gender_preference });
const nextId = (table: "travellers" | "groups", prefix: string, pad: number) => {
  const ids = (db.prepare(`SELECT id FROM ${table} WHERE id LIKE ?`).all(`${prefix}%`) as { id: string }[]).map((r) => parseInt(r.id.slice(prefix.length), 10) || 0);
  return prefix + String(Math.max(0, ...ids) + 1).padStart(pad, "0");
};

function groupSummary(g: Group, viewer?: Traveller) {
  const owner = getTraveller(g.owner_id)!;
  const members = g.member_ids.map((id) => getTraveller(id)!);
  const city = cityByName.get(g.city)!;
  const booking = getBooking(g.id);
  return {
    id: g.id, name: g.name, city: g.city, country: city.country, timezone: city.timezone,
    check_in: g.check_in, check_out: g.check_out, nights: nightsBetween(g.check_in, g.check_out),
    max_size: g.max_size, budget_inr: g.budget_inr, itinerary: g.itinerary,
    owner: profile(owner), members: members.map(profile), open_places: Math.max(0, g.max_size - members.length),
    mix: members.every((m) => m.gender === "FEMALE") ? "ALL_WOMEN" : members.every((m) => m.gender === "MALE") ? "ALL_MEN" : "MIXED",
    booked: !!booking,
    is_member: viewer ? g.member_ids.includes(viewer.id) : false,
    is_owner: viewer ? g.owner_id === viewer.id : false,
  };
}
const pendingCount = (groupId: string) =>
  (db.prepare("SELECT COUNT(*) n FROM join_requests WHERE group_id = ? AND status = 'PENDING'").get(groupId) as { n: number }).n;

// ---------- meta ----------
app.get("/api/health", wrap(() => ({ ok: true })));
app.get("/api/meta", wrap(() => ({
  cities, interests, departure_cities: departureCities, window: { start: WINDOW_START, end: WINDOW_END },
  stats: { cities: cities.length, open_groups: listGroups().filter((g) => g.member_ids.length < g.max_size && !getBooking(g.id)).length, rules: 6 },
})));

// ---------- travellers (M1, G2) ----------
const USERNAME_RULE = "Use 3–20 characters: lowercase letters, numbers or _.";
const USERNAME_TAKEN = "That username is already taken. Try another.";
// Live check for the sign-up form. The POST below enforces the same rules, so this is only a convenience.
app.get("/api/usernames/:username", wrap((req) => {
  const u = String(req.params.username).trim().toLowerCase();
  if (!USERNAME_RE.test(u)) return { username: u, available: false, reason: USERNAME_RULE };
  if (usernameTaken(u)) return { username: u, available: false, reason: USERNAME_TAKEN };
  return { username: u, available: true, reason: null };
}));
app.get("/api/travellers", wrap(() => listTravellers().map(profile)));
app.post("/api/travellers", wrap((req) => {
  const b = req.body ?? {};
  const username = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
  if (!USERNAME_RE.test(username)) throw new ValidationError("username", USERNAME_RULE);
  if (usernameTaken(username)) throw new ValidationError("username", USERNAME_TAKEN);
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 2 || name.length > 60) throw new ValidationError("name", "Enter your name (2–60 characters).");
  const age = Number(b.age);
  if (!Number.isInteger(age) || age < 18 || age > 100) throw new ValidationError("age", "Age must be a whole number from 18 to 100.");
  if (b.gender !== "FEMALE" && b.gender !== "MALE") throw new ValidationError("gender", "Pick a gender.");
  if (b.gender_preference !== "ANY" && b.gender_preference !== "SAME_GENDER") throw new ValidationError("gender_preference", "Pick who you travel with.");
  const home = departureCities.find((d) => d.city === b.home_city);
  if (!home) throw new ValidationError("home_city", "Pick your home city.");
  const ints = validateInterests(b.interests, 2);
  const id = nextId("travellers", "T-", 3);
  try {
    db.prepare(`INSERT INTO travellers (id,username,name,age,gender,home_city,home_airport,interests,gender_preference) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, username, name, age, b.gender, home.city, home.airport, JSON.stringify(ints), b.gender_preference);
  } catch (e) {
    // Two people submitting the same name at the same moment: the unique index catches the second one.
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") throw new ValidationError("username", USERNAME_TAKEN);
    throw e;
  }
  return profile(getTraveller(id)!);
}));
app.get("/api/travellers/:id", wrap((req) => {
  const t = getTraveller(String(req.params.id));
  if (!t) throw new HttpError(404, "Traveller not found.");
  const groups = listGroups().filter((g) => g.member_ids.includes(t.id)).map((g) => groupSummary(g));
  return { ...profile(t), home_airport: t.home_airport, groups };
}));
app.get("/api/me", wrap((req) => {
  const t = me(req);
  const pending = (db.prepare(`SELECT COUNT(*) n FROM join_requests r JOIN groups g ON g.id = r.group_id WHERE g.owner_id = ? AND r.status = 'PENDING'`).get(t.id) as { n: number }).n;
  const unread = (db.prepare("SELECT COUNT(*) n FROM notifications WHERE traveller_id = ? AND read_at IS NULL").get(t.id) as { n: number }).n;
  return { ...profile(t), home_airport: t.home_airport, pending_requests: pending, unread_notifications: unread };
}));

// ---------- bell notifications ----------
app.get("/api/notifications", wrap((req) => {
  const t = me(req);
  return (db.prepare("SELECT * FROM notifications WHERE traveller_id = ? ORDER BY id DESC LIMIT 20").all(t.id) as any[]).map((n) => ({
    id: n.id, kind: n.kind, body: n.body, created_at: n.created_at, read: n.read_at !== null,
    group: n.group_id ? { id: n.group_id, name: getGroup(n.group_id)?.name ?? n.group_id } : null,
    actor: n.actor_id ? { id: n.actor_id, name: getTraveller(n.actor_id)?.name ?? n.actor_id } : null,
  }));
}));
app.post("/api/notifications/read", wrap((req) => {
  const t = me(req);
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE traveller_id = ? AND read_at IS NULL").run(t.id);
  return { ok: true };
}));

// ---------- group posts (M2) ----------
app.post("/api/groups", wrap((req) => {
  const t = me(req);
  const b = req.body ?? {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 3 || name.length > 80) throw new ValidationError("name", "Give the group a name (3–80 characters).");
  const trip = validateTrip(b);
  const maxSize = Number(b.max_size);
  if (!Number.isInteger(maxSize) || maxSize < 1 || maxSize > 4) throw new ValidationError("max_size", "Group size must be 1 to 4 people in total, including you.");
  const itinerary = typeof b.itinerary === "string" ? b.itinerary.trim().slice(0, 2000) : "";
  const id = nextId("groups", "G-", 2);
  db.transaction(() => {
    db.prepare(`INSERT INTO groups (id,name,owner_id,city,check_in,check_out,max_size,budget_inr,itinerary) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, name, t.id, trip.city, trip.check_in, trip.check_out, maxSize, trip.budget_inr, itinerary);
    db.prepare("INSERT INTO group_members (group_id,traveller_id,position) VALUES (?,?,0)").run(id, t.id);
  })();
  return groupSummary(getGroup(id)!, t);
}));
app.get("/api/budget-range", wrap((req) => budgetRange(Number(req.query.budget) || 0)));

app.get("/api/groups/:id", wrap((req) => {
  const viewer = req.header("x-traveller-id") ? getTraveller(req.header("x-traveller-id")!) : undefined;
  const g = groupOr404(String(req.params.id));
  const myReq = viewer ? db.prepare("SELECT status FROM join_requests WHERE group_id = ? AND seeker_id = ? ORDER BY id DESC").get(g.id, viewer.id) as any : undefined;
  const booking = getBooking(g.id);
  // Cost preview for people looking at a group they could join. Budget % uses their own search, if given.
  const canJoin = !booking && g.member_ids.length < g.max_size && !(viewer && g.member_ids.includes(viewer.id));
  const sr = viewer && req.query.search_id
    ? db.prepare("SELECT budget_inr FROM searches WHERE id = ? AND traveller_id = ?").get(Number(req.query.search_id), viewer.id) as { budget_inr: number } | undefined
    : undefined;
  return {
    ...groupSummary(g, viewer),
    pending_count: viewer && g.owner_id === viewer.id ? pendingCount(g.id) : 0,
    my_request: myReq?.status ?? null,
    booking: booking ? bookingView(booking) : null,
    cost_preview: canJoin ? costPreview(g, sr?.budget_inr ?? 0, bookedRooms()) : null,
  };
}));

// ---------- search + matches (M3, M4, G1) ----------
app.post("/api/search", wrap((req) => {
  const t = me(req);
  const b = req.body ?? {};
  const trip = validateTrip(b);
  const ints = validateInterests(b.interests ?? []);
  if (b.gender_preference !== "ANY" && b.gender_preference !== "SAME_GENDER") throw new ValidationError("gender_preference", "Pick who you travel with.");
  const s: SeekerSearch = { ...trip, interests: ints, gender: t.gender, gender_preference: b.gender_preference };
  const searchId = db.prepare(`INSERT INTO searches (traveller_id,home_city,city,check_in,check_out,budget_inr,interests,gender,gender_preference) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(t.id, typeof b.home_city === "string" ? b.home_city : t.home_city, s.city, s.check_in, s.check_out, s.budget_inr, JSON.stringify(s.interests), s.gender, s.gender_preference).lastInsertRowid;

  const matches: any[] = [];
  const nearMisses: any[] = [];
  // Cost preview (display only): bookings read once, quotes cached per city/dates/guests for this request.
  const booked = bookedRooms();
  const quotes: QuoteCache = new Map();
  for (const g of listGroups()) {
    if (g.member_ids.includes(t.id) || getBooking(g.id)) continue; // own groups and booked (locked) groups are not open
    const owner = getTraveller(g.owner_id)!;
    const rules = evaluate(s, g, owner);
    const failed = rules.filter((r) => !r.pass);
    const myReq = db.prepare("SELECT status FROM join_requests WHERE group_id = ? AND seeker_id = ? ORDER BY id DESC").get(g.id, t.id) as any;
    const base = {
      ...groupSummary(g, t), rules, my_request: myReq?.status ?? null,
      shared_interests: s.interests.filter((i) => owner.interests.includes(i)),
      shared_nights: sharedNights(s.check_in, s.check_out, g.check_in, g.check_out),
    };
    if (failed.length === 0) matches.push({ ...base, score: score(s, g, owner), cost_preview: costPreview(g, s.budget_inr, booked, quotes) });
    else if (failed.length === 1) {
      const fix = suggestFix(failed[0], s, g, owner);
      if (fix) nearMisses.push({ ...base, failed: failed[0], fix });
    }
  }
  // Ranking: score, then more shared nights, then earliest check-in, then group id (stable).
  matches.sort((a, b) => b.score - a.score || b.shared_nights - a.shared_nights || a.check_in.localeCompare(b.check_in) || a.id.localeCompare(b.id));

  // G1 filters, applied after matching so the 6 rules are never loosened.
  const filterInts: string[] = Array.isArray(b.filter_interests) ? b.filter_interests : [];
  const mix: string | undefined = b.mix || undefined;
  const filtered = matches.filter((m) => filterInts.every((i) => m.shared_interests.includes(i)) && (!mix || m.mix === mix));
  if (b.sort === "earliest") filtered.sort((a, b2) => a.check_in.localeCompare(b2.check_in) || b2.score - a.score);
  if (b.sort === "budget") filtered.sort((a, b2) => Math.abs(a.budget_inr - s.budget_inr) - Math.abs(b2.budget_inr - s.budget_inr));

  return { search_id: Number(searchId), search: s, total_matches: matches.length, results: filtered, near_misses: nearMisses.slice(0, 4) };
}));

// ---------- join requests (M5) ----------
app.post("/api/groups/:id/requests", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  if (g.member_ids.includes(t.id)) throw new HttpError(409, "You're already in this group.");
  if (getBooking(g.id)) throw new HttpError(409, "This group has already booked and is closed.");
  const existing = db.prepare("SELECT status FROM join_requests WHERE group_id = ? AND seeker_id = ? AND status = 'PENDING'").get(g.id, t.id);
  if (existing) throw new HttpError(409, "You already asked to join — the owner hasn't answered yet.");
  const sr = db.prepare("SELECT * FROM searches WHERE id = ? AND traveller_id = ?").get(Number(req.body?.search_id), t.id) as any;
  if (!sr) throw new HttpError(400, "Search for groups first, so we can check that this group fits you.");
  const s: SeekerSearch = { ...sr, interests: JSON.parse(sr.interests) };
  const owner = getTraveller(g.owner_id)!;
  const failed = evaluate(s, g, owner).filter((r) => !r.pass);
  if (failed.length) throw new HttpError(422, `This group doesn't fit your search: ${failed.map((f) => f.label).join(", ")}.`);
  db.prepare("INSERT INTO join_requests (group_id,seeker_id,search_id,status,score) VALUES (?,?,?, 'PENDING', ?)").run(g.id, t.id, sr.id, score(s, g, owner));
  return { status: "PENDING" };
}));

app.get("/api/groups/:id/requests", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  if (g.owner_id !== t.id) throw new HttpError(403, "Only the group owner sees join requests.");
  const owner = getTraveller(g.owner_id)!;
  const rows = db.prepare(`SELECT r.*, s.city, s.check_in, s.check_out, s.budget_inr, s.interests AS s_interests, s.gender, s.gender_preference
    FROM join_requests r LEFT JOIN searches s ON s.id = r.search_id WHERE r.group_id = ? ORDER BY r.id DESC`).all(g.id) as any[];
  const view = (r: any) => {
    const seeker = getTraveller(r.seeker_id)!;
    const s: SeekerSearch = { city: r.city, check_in: r.check_in, check_out: r.check_out, budget_inr: r.budget_inr, interests: JSON.parse(r.s_interests), gender: r.gender, gender_preference: r.gender_preference };
    // the owner sees the same 6-rule check, evaluated against the group as it is now
    return { id: r.id, status: r.status, created_at: r.created_at, decided_at: r.decided_at, seeker: profile(seeker), search: s,
      rules: evaluate(s, g, owner), score: r.score, shared_interests: s.interests.filter((i) => owner.interests.includes(i)),
      shared_nights: sharedNights(s.check_in, s.check_out, g.check_in, g.check_out) };
  };
  return { group: groupSummary(g, t), pending: rows.filter((r) => r.status === "PENDING").map(view), recent: rows.filter((r) => r.status !== "PENDING").slice(0, 8).map(view) };
}));

function decide(req: Request, approve: boolean) {
  const t = me(req);
  const r = db.prepare("SELECT * FROM join_requests WHERE id = ?").get(Number(req.params.id)) as any;
  if (!r) throw new HttpError(404, "Request not found.");
  const g = groupOr404(r.group_id);
  if (g.owner_id !== t.id) throw new HttpError(403, "Only the group owner can decide.");
  if (r.status !== "PENDING") throw new HttpError(409, `This request was already ${r.status.toLowerCase()}.`);
  if (!approve) {
    db.prepare("UPDATE join_requests SET status='REJECTED', decided_at=datetime('now') WHERE id = ?").run(r.id);
    return { status: "REJECTED" };
  }
  if (getBooking(g.id)) throw new HttpError(409, "The group already booked, so it can't take new members.");
  if (g.member_ids.length + 1 > g.max_size) throw new HttpError(409, "The group is full.");
  db.transaction(() => {
    db.prepare("INSERT INTO group_members (group_id,traveller_id,position) VALUES (?,?,?)").run(g.id, r.seeker_id, g.member_ids.length);
    db.prepare("UPDATE join_requests SET status='APPROVED', decided_at=datetime('now') WHERE id = ?").run(r.id);
    if (g.member_ids.length + 1 >= g.max_size) // now full: close the other open requests
      db.prepare("UPDATE join_requests SET status='CLOSED', decided_at=datetime('now') WHERE group_id = ? AND status='PENDING'").run(g.id);
  })();
  return { status: "APPROVED" };
}
app.post("/api/requests/:id/approve", wrap((req) => decide(req, true)));
app.post("/api/requests/:id/reject", wrap((req) => decide(req, false)));

// A member steps back from a group. Not the owner (the group would have no owner). Their old saves stay in
// saved_options (booking-service owns that table) but are hidden, because saves and budgets are read for
// current members only.
app.post("/api/groups/:id/leave", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  requireMember(g, t);
  if (g.owner_id === t.id) throw new HttpError(409, "You created this group, so you can't leave it. Your members are counting on you!");
  // After booking a member may still leave, but the booking row is booking-service's (CONTRACT.md), so it stays
  // exactly as booked: same room, total and shares. The leaver's share stays on it; the group settles it in chat.
  const booking = getBooking(g.id);
  const share = booking?.shares.find((s: any) => s.traveller_id === t.id)?.amount_paise as number | undefined;
  const shareText = share !== undefined ? `₹${(share / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "their share";
  const hotelName = booking ? hotelById.get(booking.hotel_id)?.name ?? "your hotel" : "";
  const first = t.name.split(" ")[0];
  db.transaction(() => {
    const pos = (db.prepare("SELECT position FROM group_members WHERE group_id = ? AND traveller_id = ?").get(g.id, t.id) as { position: number }).position;
    db.prepare("DELETE FROM group_members WHERE group_id = ? AND traveller_id = ?").run(g.id, t.id);
    // keep positions 0..n-1 so join order (and the paise split order) stays well defined
    db.prepare("UPDATE group_members SET position = position - 1 WHERE group_id = ? AND position > ?").run(g.id, pos);
    const note = db.prepare("INSERT INTO notifications (traveller_id, kind, group_id, actor_id, body) VALUES (?, 'MEMBER_LEFT', ?, ?, ?)");
    for (const id of g.member_ids.filter((m) => m !== t.id)) {
      const body = booking
        ? `${first} has stepped back from “${g.name}”. No hard feelings — your stay at ${hotelName} is still booked. ${first}'s share (${shareText}) is still on the booking, so have a quick chat about settling up. 🌿`
        : id === g.owner_id
        ? `${first} has stepped back from “${g.name}”. No hard feelings — their spot is open again, and new join requests will show up right here. 🌿`
        : `${first} has stepped back from “${g.name}”. No hard feelings — the trip's still on, and their spot is open for a new travel buddy. 🌿`;
      note.run(id, g.id, t.id, body);
    }
  })();
  return { left: true, group: { id: g.id, name: g.name } };
}));

app.get("/api/me/groups", wrap((req) => {
  const t = me(req);
  const mine = listGroups().filter((g) => g.member_ids.includes(t.id)).map((g) => ({ ...groupSummary(g, t), pending_count: g.owner_id === t.id ? pendingCount(g.id) : 0 }));
  const requests = (db.prepare("SELECT * FROM join_requests WHERE seeker_id = ? ORDER BY id DESC").all(t.id) as any[])
    .filter((r) => r.status !== "APPROVED").map((r) => ({ id: r.id, status: r.status, created_at: r.created_at, group: groupSummary(getGroup(r.group_id)!, t) }));
  return { groups: mine, requests };
}));

// ---------- Common Group Page (M6) ----------
function memberBudgets(g: Group): number[] {
  // current members only: someone who left keeps their APPROVED request row but no longer counts
  const rows = db.prepare(`SELECT s.budget_inr FROM join_requests r JOIN searches s ON s.id = r.search_id
    WHERE r.group_id = ? AND r.status = 'APPROVED' AND r.seeker_id IN (SELECT traveller_id FROM group_members WHERE group_id = r.group_id)`).all(g.id) as any[];
  return [g.budget_inr, ...rows.map((r) => r.budget_inr)];
}
function savesFor(groupId: string) {
  const out: Record<string, string[]> = {};
  // saves of members who left stay in the table but are not shown
  for (const r of db.prepare(`SELECT room_id, traveller_id FROM saved_options WHERE group_id = ?
    AND traveller_id IN (SELECT traveller_id FROM group_members WHERE group_id = ?) ORDER BY created_at`).all(groupId, groupId) as any[])
    (out[r.room_id] ??= []).push(r.traveller_id);
  return out;
}
app.get("/api/groups/:id/hotels", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  requireMember(g, t);
  const maxPp = Number(req.query.max_pp) || Infinity;
  let results = hotelOptions(g);
  const saves = savesFor(g.id);
  const lowestBudget = Math.min(...memberBudgets(g));
  const sort = String(req.query.sort ?? "per_person");
  const key = (h: (typeof results)[number]) => (h.best ? h.best.per_member_inr : Infinity);
  results.sort((a, b) => Number(!!b.best) - Number(!!a.best) ||
    (sort === "rating" ? b.hotel.rating - a.hotel.rating : sort === "stars" ? b.hotel.stars - a.hotel.stars || key(a) - key(b) : key(a) - key(b)));
  results = results.filter((h) => !h.best || h.best.per_member_inr <= maxPp);
  return {
    guests: g.member_ids.length, nights: nightsBetween(g.check_in, g.check_out), lowest_budget: lowestBudget,
    results, saves, booking: getBooking(g.id) ? bookingView(getBooking(g.id)) : null,
  };
}));
app.post("/api/groups/:id/saved", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  requireMember(g, t);
  if (getBooking(g.id)) throw new HttpError(409, "The booking is locked.");
  const room = roomById.get(String(req.body?.room_id));
  if (!room || hotelById.get(room.hotel_id)?.city !== g.city) throw new HttpError(400, "Pick a room in the group's city.");
  const exists = db.prepare("SELECT 1 FROM saved_options WHERE group_id=? AND traveller_id=? AND room_id=?").get(g.id, t.id, room.room_id);
  if (exists) db.prepare("DELETE FROM saved_options WHERE group_id=? AND traveller_id=? AND room_id=?").run(g.id, t.id, room.room_id);
  else {
    const opt = priceRoom(room, g);
    db.prepare("INSERT INTO saved_options (group_id,traveller_id,room_id,rooms,total_inr,per_member_inr) VALUES (?,?,?,?,?,?)")
      .run(g.id, t.id, room.room_id, opt.rooms_needed, opt.total_inr, opt.per_member_inr);
  }
  return { saved: !exists, saves: savesFor(g.id) };
}));

function bookingView(b: any) {
  const hotel = hotelById.get(b.hotel_id)!;
  const room = roomById.get(b.room_id)!;
  return {
    id: b.id, hotel: { hotel_id: hotel.hotel_id, name: hotel.name, area: hotel.area, stars: hotel.stars, image: hotel.image },
    room: { room_id: room.room_id, name: room.name, max_adults: room.max_adults }, rooms: b.rooms, nights: b.nights,
    total_inr: b.total_inr, created_at: b.created_at, booked_by: b.booked_by,
    shares: b.shares.map((s: any) => ({ ...s, name: getTraveller(s.traveller_id)?.name })),
  };
}
app.post("/api/groups/:id/booking", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  requireMember(g, t);
  if (getBooking(g.id)) throw new HttpError(409, "This group already has a booking. It's locked and can't be changed.");
  const room = roomById.get(String(req.body?.room_id));
  if (!room || hotelById.get(room.hotel_id)?.city !== g.city) throw new HttpError(400, "Pick a room in the group's city.");
  const opt = priceRoom(room, g);
  if (!opt.available) throw new HttpError(409, "Not enough rooms are free on every night of your stay any more.");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  const id = `TM-${part()}-${part()}`;
  db.prepare(`INSERT INTO bookings (id,group_id,hotel_id,room_id,rooms,nights,total_inr,shares,booked_by) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, g.id, room.hotel_id, room.room_id, opt.rooms_needed, JSON.stringify(nightList(g.check_in, g.check_out)), opt.total_inr, JSON.stringify(splitShares(opt.total_inr, g.member_ids)), t.id);
  db.prepare("UPDATE join_requests SET status='CLOSED', decided_at=datetime('now') WHERE group_id = ? AND status='PENDING'").run(g.id);
  return bookingView(getBooking(g.id));
}));

// ---------- group planning (S2) ----------
// Members plan each day of the trip (check-in day through check-out day) and share a to-do list.
const tripDays = (g: Group) => [...nightList(g.check_in, g.check_out), g.check_out];
function planItemOr404(g: Group, itemId: string) {
  const row = db.prepare("SELECT * FROM plan_items WHERE id = ? AND group_id = ?").get(Number(itemId), g.id) as any;
  if (!row) throw new HttpError(404, "Plan item not found.");
  return row;
}
app.get("/api/groups/:id/plan", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  requireMember(g, t);
  const who = (id: string | null) => (id ? { id, name: getTraveller(id)?.name ?? id } : null);
  const rows = (db.prepare("SELECT * FROM plan_items WHERE group_id = ? ORDER BY day, time IS NULL, time, id").all(g.id) as any[]).map((r) => ({
    id: r.id, kind: r.kind, day: r.day, time: r.time, body: r.body, done: r.done_at !== null,
    assignee: who(r.assignee_id), created_by: who(r.created_by), created_at: r.created_at,
  }));
  return { days: tripDays(g), activities: rows.filter((r) => r.kind === "ACTIVITY"), todos: rows.filter((r) => r.kind === "TODO") };
}));
app.post("/api/groups/:id/plan", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  requireMember(g, t);
  const b = req.body ?? {};
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 200) : "";
  if (!body) throw new ValidationError("body", "Write what you're planning first.");
  if (b.kind !== "ACTIVITY" && b.kind !== "TODO") throw new ValidationError("kind", "Pick an activity or a to-do.");
  let day: string | null = null, time: string | null = null, assignee: string | null = null;
  if (b.kind === "ACTIVITY") {
    if (!tripDays(g).includes(String(b.day))) throw new ValidationError("day", "Pick a day of the trip.");
    day = String(b.day);
    if (b.time) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.time))) throw new ValidationError("time", "Use a time like 09:30.");
      time = String(b.time);
    }
  } else if (b.assignee_id) {
    if (!g.member_ids.includes(String(b.assignee_id))) throw new ValidationError("assignee_id", "Assign it to someone in the group.");
    assignee = String(b.assignee_id);
  }
  db.prepare("INSERT INTO plan_items (group_id,kind,day,time,body,assignee_id,created_by) VALUES (?,?,?,?,?,?,?)")
    .run(g.id, b.kind, day, time, body, assignee, t.id);
  return { ok: true };
}));
app.post("/api/groups/:id/plan/:itemId/toggle", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  requireMember(g, t);
  const item = planItemOr404(g, String(req.params.itemId));
  db.prepare("UPDATE plan_items SET done_at = CASE WHEN done_at IS NULL THEN datetime('now') ELSE NULL END WHERE id = ?").run(item.id);
  return { ok: true };
}));
app.delete("/api/groups/:id/plan/:itemId", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  requireMember(g, t);
  const item = planItemOr404(g, String(req.params.itemId));
  db.prepare("DELETE FROM plan_items WHERE id = ?").run(item.id);
  return { ok: true };
}));

// ---------- chat (S1) ----------
app.get("/api/groups/:id/messages", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  requireMember(g, t);
  return (db.prepare("SELECT * FROM messages WHERE group_id = ? ORDER BY id DESC LIMIT 100").all(g.id) as any[]).reverse()
    .map((m) => ({ id: m.id, traveller_id: m.traveller_id, name: getTraveller(m.traveller_id)?.name, body: m.body, created_at: m.created_at }));
}));
app.post("/api/groups/:id/messages", wrap((req) => {
  const t = me(req);
  const g = groupOr404(String(req.params.id));
  requireMember(g, t);
  const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, 1000) : "";
  if (!body) throw new ValidationError("body", "Write a message first.");
  db.prepare("INSERT INTO messages (group_id,traveller_id,body) VALUES (?,?,?)").run(g.id, t.id, body);
  return { ok: true };
}));

// ---------- errors ----------
app.use((_req, res) => res.status(404).json({ error: "Not found." }));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message, field: err.field });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side." });
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => console.log(`Tripmate API on http://localhost:${PORT}`));
