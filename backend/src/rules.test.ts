import "./test-env"; // must stay first: tests never touch the real app.db
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedGroups, seedTravellers } from "./catalog";
import type { Group, Traveller } from "./db";
import { budgetRange, evaluate, sharedNights, suggestFix, validateTrip, type SeekerSearch } from "./rules";
import { splitShares } from "./hotels";

const travellers = new Map<string, Traveller>(seedTravellers.map((t) => [t.traveller_id, { ...t, id: t.traveller_id }]));
const groups: Group[] = seedGroups.map((g) => ({ ...g, id: g.group_id }));
const matchIds = (s: SeekerSearch) =>
  groups.filter((g) => evaluate(s, g, travellers.get(g.owner_id)!).every((r) => r.pass)).map((g) => g.id);

const priya: SeekerSearch = {
  city: "Kyoto", check_in: "2027-04-09", check_out: "2027-04-16", budget_inr: 62000,
  interests: ["TEMPLES", "STREET_FOOD", "ADVENTURE"], gender: "FEMALE", gender_preference: "SAME_GENDER",
};

test("Gate 1: Priya's search matches exactly G-01 and G-08", () => {
  assert.deepEqual(matchIds(priya).sort(), ["G-01", "G-08"]);
});

test("shared nights follow the data dictionary examples", () => {
  assert.equal(sharedNights("2027-04-10", "2027-04-15", "2027-04-09", "2027-04-16"), 5);
  assert.equal(sharedNights("2027-04-10", "2027-04-15", "2027-04-14", "2027-04-18"), 1);
  assert.equal(sharedNights("2027-04-10", "2027-04-12", "2027-04-12", "2027-04-14"), 0);
});

test("budget rule: 40% of the lower budget, inclusive", () => {
  const g01 = groups.find((g) => g.id === "G-01")!;
  const sarah = travellers.get("T-001")!;
  const budgetPass = (b: number) => evaluate({ ...priya, budget_inr: b }, g01, sarah).find((r) => r.key === "budget")!.pass;
  assert.equal(budgetPass(84000), true);
  assert.equal(budgetPass(85000), false);
  assert.equal(budgetPass(42858), true); // 60000 − 42858 = 17142 ≤ 0.4 × 42858
  assert.equal(budgetPass(42857), false);
  assert.deepEqual(budgetRange(60000), { min: 42858, max: 84000 });
});

test("gender preference is checked both ways", () => {
  const male: SeekerSearch = { ...priya, gender: "MALE", gender_preference: "ANY" };
  assert.ok(!matchIds(male).includes("G-01"));
});

test("a full group never matches", () => {
  assert.ok(!matchIds({ ...priya, check_in: "2027-04-12", check_out: "2027-04-16" }).includes("G-07")); // G-07 has 3 of 3
});

test("near-miss fix actually produces a match", () => {
  const s = { ...priya, check_in: "2027-04-14", check_out: "2027-04-17" }; // 1 night with G-01
  const g = groups.find((x) => x.id === "G-01")!;
  const owner = travellers.get(g.owner_id)!;
  const failed = evaluate(s, g, owner).filter((r) => !r.pass);
  assert.equal(failed.length, 1);
  const fix = suggestFix(failed[0], s, g, owner)!;
  assert.ok(evaluate({ ...s, ...fix.patch }, g, owner).every((r) => r.pass));
});

test("trips outside the data are rejected with a clear message", () => {
  assert.throws(() => validateTrip({ city: "Bangkok", check_in: "2027-04-10", check_out: "2027-04-12", budget_inr: 1 }), /Tokyo, Kyoto/);
  assert.throws(() => validateTrip({ city: "Kyoto", check_in: "2027-04-10", check_out: "2027-04-25", budget_inr: 1 }), /1–20 April/);
});

test("cost split adds up exactly in paise", () => {
  const shares = splitShares(100001, ["a", "b", "c"]);
  assert.equal(shares.reduce((s, x) => s + x.amount_paise, 0), 10000100);
  assert.deepEqual(shares.map((s) => s.amount_paise), [3333367, 3333367, 3333366]);
});
