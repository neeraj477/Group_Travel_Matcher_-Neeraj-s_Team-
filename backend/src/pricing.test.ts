import "./test-env"; // must stay first: uses a temporary database
import { test } from "node:test";
import assert from "node:assert/strict";
import { rooms, hotels, seedGroups } from "./catalog";
import type { Group } from "./db";
import { hotelOptions, bookedRooms } from "./hotels";
import { cheapestStay, costPreview, type QuoteCache } from "./pricing";

const groups: Group[] = seedGroups.map((g) => ({ ...g, id: g.group_id }));
const g01 = groups.find((g) => g.id === "G-01")!; // Kyoto, 10 → 15 Apr, Sarah only
const KYOTO = ["Kyoto", "2027-04-10", "2027-04-15"] as const;
const roomType = (id: string) => rooms.find((r) => r.room_id === id)!;

test("1 → 2 guests: a twin/double for two, and the per-person cost drops", () => {
  const one = cheapestStay(...KYOTO, 1).quote!;
  const two = cheapestStay(...KYOTO, 2).quote!;
  assert.equal(one.per_member_inr, 18480); // single room, Kyoto Station Budget Inn
  assert.equal(one.rooms, 1);
  assert.equal(two.hotel_name, "Gion Corner Hotel");
  assert.equal(two.room_name, "Twin Room");
  assert.equal(two.rooms, 1);
  assert.equal(two.total_inr, 23800); // the data dictionary's worked example
  assert.equal(two.per_member_inr, 11900);
  assert.ok(["TWIN", "DOUBLE"].includes(roomType(two.room_id).room_type));

  const p = costPreview(g01, 62000);
  assert.equal(p.nights, 5);
  assert.equal(p.saving_per_member_inr, 18480 - 11900);
  assert.equal(p.budget_share_pct, 19.2); // 11,900 / 62,000
  assert.equal(p.reason, null);
});

test("2 → 3 guests: a triple or a second room, and a negative saving is reported honestly", () => {
  const two = cheapestStay(...KYOTO, 2).quote!;
  const three = cheapestStay(...KYOTO, 3).quote!;
  assert.ok(three.rooms * roomType(three.room_id).max_adults >= 3, "three people must fit");
  assert.ok(three.rooms > 1 || roomType(three.room_id).max_adults >= 3, "extra room or a triple");
  assert.equal(three.per_member_inr, 15120); // Kyoto Tower View triple

  const p = costPreview({ ...g01, member_ids: ["T-001", "T-002"] }, 62000);
  assert.equal(p.saving_per_member_inr, Math.round((two.per_member_inr - three.per_member_inr) * 100) / 100);
  assert.ok(p.saving_per_member_inr! <= 0, "joining a pair costs each person more here, and we say so");
});

test("no free rooms on one night → null quote with a reason", () => {
  // Pretend our own bookings took every Kyoto room on the night of 12 Apr.
  const kyotoHotels = new Set(hotels.filter((h) => h.city === "Kyoto").map((h) => h.hotel_id));
  const booked = new Map(rooms.filter((r) => kyotoHotels.has(r.hotel_id)).map((r) => [`${r.room_id}|2027-04-12`, 999]));
  const r = cheapestStay(...KYOTO, 2, booked);
  assert.equal(r.quote, null);
  assert.equal(r.reason, "No stay in Kyoto has free rooms for all 2 of you on 10–15 Apr");

  const p = costPreview(g01, 62000, booked);
  assert.equal(p.now, null);
  assert.equal(p.if_join, null);
  assert.equal(p.saving_per_member_inr, null);
  assert.equal(p.budget_share_pct, null);
  assert.ok(p.reason);
});

test("if_join equals the cheapest per_member_inr the group page (/hotels) shows at that size", () => {
  const booked = bookedRooms();
  for (const g of groups) {
    const p = costPreview(g, 60000, booked);
    if (!p.if_join) continue;
    const joined: Group = { ...g, member_ids: [...g.member_ids, "T-NEW"] };
    const pagePrices = hotelOptions(joined).filter((h) => h.best).map((h) => h.best!.per_member_inr);
    assert.equal(p.if_join.per_member_inr, Math.min(...pagePrices), `group ${g.id}`);
    const nowPrices = hotelOptions(g).filter((h) => h.best).map((h) => h.best!.per_member_inr);
    assert.equal(p.now?.per_member_inr, Math.min(...nowPrices), `group ${g.id} now`);
  }
});

test("quotes are cached per city, dates and guests within one request", () => {
  const cache: QuoteCache = new Map();
  costPreview(g01, 62000, new Map(), cache);
  costPreview({ ...g01, id: "copy" } as Group, 50000, new Map(), cache);
  assert.deepEqual([...cache.keys()].sort(), ["Kyoto|2027-04-10|2027-04-15|1", "Kyoto|2027-04-10|2027-04-15|2"]);
});
