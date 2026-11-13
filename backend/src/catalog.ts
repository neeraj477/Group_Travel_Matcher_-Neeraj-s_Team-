// Read-only access to the hackathon data pack. These files are never written to.
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(__dirname, "../../data");
export const IMAGES_DIR = process.env.IMAGES_DIR ?? path.resolve(__dirname, "../../images");

function load<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), "utf8")) as T;
}

export type Gender = "FEMALE" | "MALE";
export type GenderPref = "ANY" | "SAME_GENDER";

export interface SeedTraveller {
  traveller_id: string; name: string; age: number; gender: Gender; home_city: string;
  home_airport: string; interests: string[]; gender_preference: GenderPref;
}
export interface SeedGroup {
  group_id: string; name: string; owner_id: string; member_ids: string[]; city: string;
  check_in: string; check_out: string; max_size: number; budget_inr: number; itinerary: string;
}
export interface Interest { interest: string; label: string; category: string }
export interface Hotel {
  hotel_id: string; name: string; city: string; area: string; lat: number; lng: number;
  rating: number; stars: number; check_in_from: string; check_out_until: string; image: string;
}
export interface Room {
  room_id: string; hotel_id: string; room_type: string; name: string; max_adults: number;
  price_per_night: { amount: number; currency: string }; refundable: boolean;
}
interface Destinations {
  departure_cities: { airport: string; city: string }[];
  countries: { code: string; name: string; timezone: string; cities: { name: string }[] }[];
}

export const seedTravellers = load<SeedTraveller[]>("problem-3/travellers.json");
export const seedGroups = load<SeedGroup[]>("problem-3/groups.json");
export const interests = load<Interest[]>("problem-3/interests.json");
const destinationsRaw = load<Destinations>("catalog/destinations.json");
export const hotels = load<Hotel[]>("catalog/hotels.json");
export const rooms = load<Room[]>("catalog/rooms.json");
const availabilityRaw = load<{ room_id: string; date: string; rooms_left: number }[]>("catalog/availability.json");

export const interestIds = new Set(interests.map((i) => i.interest));
export const departureCities = destinationsRaw.departure_cities;

export interface City { name: string; country: string; country_code: string; timezone: string }
export const cities: City[] = destinationsRaw.countries.flatMap((c) =>
  c.cities.map((city) => ({ name: city.name, country: c.name, country_code: c.code, timezone: c.timezone })),
);
export const cityByName = new Map(cities.map((c) => [c.name, c]));

/** availability[room_id][date] = rooms left that night (catalog value, before our own bookings) */
export const availability = new Map<string, Map<string, number>>();
for (const a of availabilityRaw) {
  if (!availability.has(a.room_id)) availability.set(a.room_id, new Map());
  availability.get(a.room_id)!.set(a.date, a.rooms_left);
}
export const hotelById = new Map(hotels.map((h) => [h.hotel_id, h]));
export const roomById = new Map(rooms.map((r) => [r.room_id, r]));
