// Common Group Page (M6): hotel options for a group's city and dates, priced for the group.
// The pricing maths itself lives in pricing.ts (pure, shared with the search cost preview).
import { hotels, rooms, type Hotel, type Room } from "./catalog";
import { db, type Group } from "./db";
import { quoteRoom, type RoomOption } from "./pricing";
import { fmtShort } from "./rules";

export type { RoomOption } from "./pricing";

/** Rooms our own bookings already took, per room type and night (the catalog files stay untouched). */
export function bookedRooms(): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of db.prepare("SELECT room_id, rooms, nights FROM bookings").all() as any[])
    for (const n of JSON.parse(b.nights) as string[]) m.set(`${b.room_id}|${n}`, (m.get(`${b.room_id}|${n}`) ?? 0) + b.rooms);
  return m;
}

/** Price one room type for the group as it is now (its city, dates and member count). */
export function priceRoom(room: Room, group: Group, booked = bookedRooms()): RoomOption {
  return quoteRoom(room, group.check_in, group.check_out, group.member_ids.length, booked);
}

export interface HotelResult {
  hotel: Pick<Hotel, "hotel_id" | "name" | "area" | "stars" | "rating" | "lat" | "lng" | "image">;
  best: RoomOption | null; // cheapest bookable room type for this group
  options: RoomOption[]; // every room type, bookable ones first
  unavailable_reason: string | null;
}

export function hotelOptions(group: Group): HotelResult[] {
  const booked = bookedRooms();
  return hotels
    .filter((h) => h.city === group.city)
    .map((h) => {
      const opts = rooms.filter((r) => r.hotel_id === h.hotel_id).map((r) => priceRoom(r, group, booked))
        .sort((a, b) => Number(b.available) - Number(a.available) || a.total_inr - b.total_inr);
      const best = opts.find((o) => o.available) ?? null;
      const firstFull = opts.map((o) => o.full_on).filter(Boolean).sort()[0] as string | undefined;
      return {
        hotel: { hotel_id: h.hotel_id, name: h.name, area: h.area, stars: h.stars, rating: h.rating, lat: h.lat, lng: h.lng, image: h.image },
        best, options: opts,
        unavailable_reason: best ? null : `Full on ${firstFull ? fmtShort(firstFull) : "your dates"} — not bookable for your dates`,
      };
    });
}

/** Equal split in paise; leftover paise go to the first members so the shares always add up to the total. */
export function splitShares(totalInr: number, memberIds: string[]) {
  const totalPaise = totalInr * 100;
  const base = Math.floor(totalPaise / memberIds.length);
  const rem = totalPaise - base * memberIds.length;
  return memberIds.map((id, i) => ({ traveller_id: id, amount_paise: base + (i < rem ? 1 : 0) }));
}
