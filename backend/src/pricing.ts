// Stay pricing: one pure place for rooms needed, availability on every night, totals and per-member cost.
// Used by the Common Group Page (hotels.ts) and by the search cost preview, so both always show the same numbers.
// Pure: no database. Rooms our own bookings already took come in as `booked` ("room_id|night" → rooms).
import { hotelById, hotels, rooms, availability, type Room } from "./catalog";
import { fmtShort, nightList } from "./rules";

export type Booked = ReadonlyMap<string, number>;
const NONE_BOOKED: Booked = new Map();

export interface RoomOption {
  room_id: string; room_name: string; room_type: string; max_adults: number; price_per_night: number;
  refundable: boolean; rooms_needed: number; nights: number; total_inr: number; per_member_inr: number;
  available: boolean; min_rooms_left: number; full_on: string | null;
}

/** Price one room type for `guests` people over check_in → check_out (check-out day is not a night). */
export function quoteRoom(room: Room, checkIn: string, checkOut: string, guests: number, booked: Booked = NONE_BOOKED): RoomOption {
  const nights = nightList(checkIn, checkOut);
  const roomsNeeded = Math.ceil(guests / room.max_adults);
  let minLeft = Infinity;
  let fullOn: string | null = null;
  for (const n of nights) {
    const left = (availability.get(room.room_id)?.get(n) ?? 0) - (booked.get(`${room.room_id}|${n}`) ?? 0);
    minLeft = Math.min(minLeft, left);
    if (left < roomsNeeded && !fullOn) fullOn = n;
  }
  const total = room.price_per_night.amount * roomsNeeded * nights.length;
  return {
    room_id: room.room_id, room_name: room.name, room_type: room.room_type, max_adults: room.max_adults,
    price_per_night: room.price_per_night.amount, refundable: room.refundable, rooms_needed: roomsNeeded,
    nights: nights.length, total_inr: total,
    per_member_inr: total / guests, // not rounded (CONTRACT.md); the UI rounds for display
    available: fullOn === null, min_rooms_left: Math.max(0, minLeft), full_on: fullOn,
  };
}

export interface StayQuote {
  guests: number; hotel_id: string; hotel_name: string; room_id: string; room_name: string;
  rooms: number; total_inr: number; per_member_inr: number;
}

/** "10–15 Apr", or "28 Mar–2 Apr" across months. */
export function fmtStay(checkIn: string, checkOut: string): string {
  const a = fmtShort(checkIn), b = fmtShort(checkOut);
  return checkIn.slice(0, 7) === checkOut.slice(0, 7) ? `${a.split(" ")[0]}–${b}` : `${a}–${b}`;
}

/**
 * The cheapest stay for `guests` people in `city`: lowest per-member cost among room types with enough
 * free rooms on every night. Ties keep catalog order (hotel, then room), so the pick is stable.
 */
export function cheapestStay(city: string, checkIn: string, checkOut: string, guests: number, booked: Booked = NONE_BOOKED):
  { quote: StayQuote | null; reason: string | null } {
  let best: RoomOption | null = null;
  for (const h of hotels) {
    if (h.city !== city) continue;
    for (const r of rooms) {
      if (r.hotel_id !== h.hotel_id) continue;
      const o = quoteRoom(r, checkIn, checkOut, guests, booked);
      if (o.available && (!best || o.per_member_inr < best.per_member_inr)) best = o;
    }
  }
  if (!best) {
    const who = guests === 1 ? "1 person" : `all ${guests} of you`;
    return { quote: null, reason: `No stay in ${city} has free rooms for ${who} on ${fmtStay(checkIn, checkOut)}` };
  }
  const room = rooms.find((r) => r.room_id === best!.room_id)!;
  return {
    quote: {
      guests, hotel_id: room.hotel_id, hotel_name: hotelById.get(room.hotel_id)!.name, room_id: best.room_id,
      room_name: best.room_name, rooms: best.rooms_needed, total_inr: best.total_inr, per_member_inr: best.per_member_inr,
    },
    reason: null,
  };
}

export interface CostPreview {
  nights: number;
  now: StayQuote | null;
  if_join: StayQuote | null;
  saving_per_member_inr: number | null;
  budget_share_pct: number | null;
  reason: string | null;
}

/** Quotes cached per (city, check_in, check_out, guests). Make one per request, because availability changes. */
export type QuoteCache = Map<string, ReturnType<typeof cheapestStay>>;

/**
 * What a seeker's seat does to the group's stay cost: the cheapest stay at the current size vs. one more.
 * Uses the GROUP's city and dates (that is the stay they would join), not the seeker's search dates.
 * Display only: it never affects matching or ranking.
 */
export function costPreview(
  group: { city: string; check_in: string; check_out: string; member_ids: string[] },
  seekerBudgetInr: number, booked: Booked = NONE_BOOKED, cache: QuoteCache = new Map(),
): CostPreview {
  const quote = (guests: number) => {
    const key = `${group.city}|${group.check_in}|${group.check_out}|${guests}`;
    let q = cache.get(key);
    if (!q) { q = cheapestStay(group.city, group.check_in, group.check_out, guests, booked); cache.set(key, q); }
    return q;
  };
  const members = group.member_ids.length;
  const now = quote(members), ifJoin = quote(members + 1);
  return {
    nights: nightList(group.check_in, group.check_out).length,
    now: now.quote,
    if_join: ifJoin.quote,
    // paise precision; can be ≤ 0 (e.g. 2 → 3 people needs a triple or a second room): reported as is
    saving_per_member_inr: now.quote && ifJoin.quote ? Math.round((now.quote.per_member_inr - ifJoin.quote.per_member_inr) * 100) / 100 : null,
    budget_share_pct: ifJoin.quote && seekerBudgetInr > 0 ? Math.round((ifJoin.quote.per_member_inr / seekerBudgetInr) * 1000) / 10 : null,
    reason: ifJoin.reason ?? now.reason,
  };
}
