// All data comes from the backend API. The frontend never reads the data files.
const KEY = "tripmate.traveller";
export const session = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (id: string) => { try { localStorage.setItem(KEY, id); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* private mode */ } },
};

export class ApiError extends Error {
  constructor(message: string, public status: number, public field?: string) { super(message); }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const id = session.get();
  if (id) headers["x-traveller-id"] = id;
  let res: Response;
  try {
    res = await fetch("/api" + path, { method: opts.method ?? (opts.body ? "POST" : "GET"), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError("Can't reach the server. Is the backend running?", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.field);
  return data as T;
}

// ---------- types (mirror the backend responses) ----------
export type Gender = "FEMALE" | "MALE";
export type GenderPref = "ANY" | "SAME_GENDER";
export interface Profile { id: string; name: string; age: number | null; gender: Gender; home_city: string | null; interests: string[]; gender_preference: GenderPref }
export interface Me extends Profile { home_airport: string | null; pending_requests: number; unread_notifications: number }
export interface Notification {
  id: number; kind: string; body: string; created_at: string; read: boolean;
  group: { id: string; name: string } | null; actor: { id: string; name: string } | null;
}
export interface Interest { interest: string; label: string; category: string }
export interface City { name: string; country: string; country_code: string; timezone: string }
export interface Meta {
  cities: City[]; interests: Interest[]; departure_cities: { airport: string; city: string }[];
  window: { start: string; end: string }; stats: { cities: number; open_groups: number; rules: number };
}
export interface GroupSummary {
  id: string; name: string; city: string; country: string; timezone: string; check_in: string; check_out: string; nights: number;
  max_size: number; budget_inr: number; itinerary: string; owner: Profile; members: Profile[]; open_places: number;
  mix: "ALL_WOMEN" | "ALL_MEN" | "MIXED"; booked: boolean; is_member: boolean; is_owner: boolean;
}
export interface RuleResult { key: string; label: string; pass: boolean; value: string; detail: string }
export interface Booking {
  id: string; hotel: { hotel_id: string; name: string; area: string; stars: number; image: string };
  room: { room_id: string; name: string; max_adults: number }; rooms: number; nights: string[]; total_inr: number;
  created_at: string; booked_by: string; shares: { traveller_id: string; amount_paise: number; name: string }[];
}
/** Cheapest stay for the group's city and dates at a given group size (priced by the backend). */
export interface StayQuote { guests: number; hotel_id: string; hotel_name: string; room_id: string; room_name: string; rooms: number; total_inr: number; per_member_inr: number }
export interface CostPreview {
  nights: number; now: StayQuote | null; if_join: StayQuote | null;
  saving_per_member_inr: number | null; budget_share_pct: number | null; reason: string | null;
}
export interface GroupDetail extends GroupSummary { pending_count: number; my_request: string | null; booking: Booking | null; cost_preview: CostPreview | null }
export interface Match extends GroupSummary { rules: RuleResult[]; my_request: string | null; shared_interests: string[]; shared_nights: number; score: number; cost_preview: CostPreview }
export interface NearMiss extends GroupSummary { rules: RuleResult[]; failed: RuleResult; fix: { label: string; patch: Partial<SearchInput> }; shared_interests: string[]; shared_nights: number; my_request: string | null }
export interface SearchInput { home_city?: string; city: string; check_in: string; check_out: string; budget_inr: number; interests: string[]; gender_preference: GenderPref }
export interface SearchResponse { search_id: number; search: SearchInput & { gender: Gender }; total_matches: number; results: Match[]; near_misses: NearMiss[] }
export interface JoinRequest {
  id: number; status: string; created_at: string; decided_at: string | null; seeker: Profile; search: SearchInput & { gender: Gender };
  rules: RuleResult[]; score: number | null; shared_interests: string[]; shared_nights: number;
}
export interface RoomOption {
  room_id: string; room_name: string; room_type: string; max_adults: number; price_per_night: number; refundable: boolean;
  rooms_needed: number; nights: number; total_inr: number; per_member_inr: number; available: boolean; min_rooms_left: number; full_on: string | null;
}
export interface HotelResult {
  hotel: { hotel_id: string; name: string; area: string; stars: number; rating: number; lat: number; lng: number; image: string };
  best: RoomOption | null; options: RoomOption[]; unavailable_reason: string | null;
}
export interface HotelsResponse { guests: number; nights: number; lowest_budget: number; results: HotelResult[]; saves: Record<string, string[]>; booking: Booking | null }
export interface Message { id: number; traveller_id: string; name: string; body: string; created_at: string }

// ---------- formatting ----------
export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const paise = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parts = (d: string) => ({ y: +d.slice(0, 4), m: +d.slice(5, 7), day: +d.slice(8, 10), dow: new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay() });
export const dShort = (d: string) => `${parts(d).day} ${MONTHS[parts(d).m - 1]}`;
export const dLong = (d: string) => { const p = parts(d); return `${DOW[p.dow]}, ${p.day} ${MONTHS[p.m - 1]} ${p.y}`; };
export const range = (a: string, b: string) => `${parts(a).day} → ${parts(b).day} ${MONTHS[parts(b).m - 1]}`;
export const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
export const nightsOf = (a: string, b: string) => dayNum(b) - dayNum(a);
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const firstName = (name: string) => { const [f, l] = name.split(/\s+/); return l ? `${f} ${l[0]}.` : f; };
export const ago = (sqlTime: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(sqlTime.replace(" ", "T") + "Z").getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return mins < 60 * 48 ? "yesterday" : `${Math.round(mins / 1440)} days ago`;
};
