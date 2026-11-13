// Common Group Page (M6): hotel options for a group's city and dates, priced for the group.
import { availability, hotels, rooms, type Hotel, type Room } from "./catalog";
import { db, type Group } from "./db";
import { fmtShort, nightList } from "./rules";

/** Rooms our own bookings already took, per room type and night (the catalog files stay untouched). */
function bookedRooms(): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of db.prepare("SELECT room_id, rooms, nights FROM bookings").all() as any[])
    for (const n of JSON.parse(b.nights) as string[]) m.set(`${b.room_id}|${n}`, (m.get(`${b.room_id}|${n}`) ?? 0) + b.rooms);
  return m;
}

export interface RoomOption {
  room_id: string; room_name: string; room_type: string; max_adults: number; price_per_night: number;
  refundable: boolean; rooms_needed: number; nights: number; total_inr: number; per_member_inr: number;
  available: boolean; min_rooms_left: number; full_on: string | null;
}

export function priceRoom(room: Room, group: Group, booked = bookedRooms()): RoomOption {
  const members = group.member_ids.length;
  const nights = nightList(group.check_in, group.check_out);
  const roomsNeeded = Math.ceil(members / room.max_adults);
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
    nights: nights.length, total_inr: total, per_member_inr: total / members,
    available: fullOn === null, min_rooms_left: Math.max(0, minLeft), full_on: fullOn,
  };
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
