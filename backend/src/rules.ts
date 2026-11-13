// Matching logic: the 6 rules from the problem statement, the match score, and near-miss suggestions.
import { cityByName, interestIds, interests, type Gender, type GenderPref } from "./catalog";
import type { Group, Traveller } from "./db";

export const WINDOW_START = "2027-04-01";
export const WINDOW_END = "2027-04-20";
export const MIN_SHARED_NIGHTS = 2;
export const MIN_SHARED_INTERESTS = 2;
export const BUDGET_TOLERANCE = 0.4;

// ---------- dates (plain YYYY-MM-DD strings, local to the destination city; no timezone maths needed) ----------
const DAY = 86_400_000;
const toDay = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY;
export const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromDay(toDay(d) + n);
export const nightsBetween = (a: string, b: string) => toDay(b) - toDay(a);
/** The nights of a stay: check_in up to the day before check_out. */
export function nightList(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let d = toDay(checkIn); d < toDay(checkOut); d++) out.push(fromDay(d));
  return out;
}
export function sharedNights(aIn: string, aOut: string, bIn: string, bOut: string): number {
  return Math.max(0, Math.min(toDay(aOut), toDay(bOut)) - Math.max(toDay(aIn), toDay(bIn)));
}
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromDay(toDay(s)) === s;

// ---------- validation shared by the group form (M2) and the search form (M3) ----------
export class ValidationError extends Error {
  constructor(public field: string, message: string) { super(message); }
}
export function validateTrip(input: { city?: unknown; check_in?: unknown; check_out?: unknown; budget_inr?: unknown }) {
  const { city, check_in, check_out, budget_inr } = input;
  if (typeof city !== "string" || !cityByName.has(city))
    throw new ValidationError("city", `We only have data for Tokyo, Kyoto, Osaka, Dubai and Abu Dhabi${typeof city === "string" && city ? ` — "${city}" is not one of them` : ""}.`);
  if (!isDate(check_in)) throw new ValidationError("check_in", "Pick a valid check-in date.");
  if (!isDate(check_out)) throw new ValidationError("check_out", "Pick a valid check-out date.");
  if (check_in < WINDOW_START || check_in >= WINDOW_END)
    throw new ValidationError("check_in", "We only have hotel data for 1–20 April 2027. Pick a check-in between 1 and 19 Apr.");
  if (check_out > WINDOW_END || check_out <= WINDOW_START)
    throw new ValidationError("check_out", "We only have hotel data for 1–20 April 2027. Pick a check-out on or before 20 Apr.");
  if (check_out <= check_in) throw new ValidationError("check_out", "Check-out must be after check-in.");
  const budget = Number(budget_inr);
  if (!Number.isInteger(budget) || budget <= 0) throw new ValidationError("budget_inr", "Budget must be a whole amount in rupees, above ₹0.");
  return { city, check_in, check_out, budget_inr: budget };
}
export function validateInterests(list: unknown, min = 0): string[] {
  if (!Array.isArray(list) || list.some((i) => typeof i !== "string" || !interestIds.has(i)))
    throw new ValidationError("interests", "Pick interests from the list.");
  const uniq = [...new Set(list as string[])];
  if (uniq.length < min) throw new ValidationError("interests", `Pick at least ${min} interests.`);
  return uniq;
}

// ---------- the 6 rules ----------
export interface SeekerSearch {
  city: string; check_in: string; check_out: string; budget_inr: number; interests: string[];
  gender: Gender; gender_preference: GenderPref;
}
export type RuleKey = "city" | "nights" | "budget" | "interests" | "gender" | "size";
export interface RuleResult { key: RuleKey; label: string; pass: boolean; value: string; detail: string }

/** Does someone with this preference and gender accept a person of `otherGender`? */
const accepts = (pref: GenderPref, own: Gender, other: Gender) => pref === "ANY" || own === other;
const G = (g: Gender) => (g === "FEMALE" ? "W" : "M");
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function budgetGap(a: number, b: number) {
  const lower = Math.min(a, b);
  return { diff: Math.abs(a - b), lower, pct: (Math.abs(a - b) / lower) * 100 };
}
/** Budgets that pass the 40% rule against `b`: |x − b| ≤ 0.4 × min(x, b). */
export function budgetRange(b: number) {
  return { min: Math.ceil(b / (1 + BUDGET_TOLERANCE)), max: Math.floor(b * (1 + BUDGET_TOLERANCE)) };
}

export function evaluate(s: SeekerSearch, group: Group, owner: Traveller): RuleResult[] {
  const nights = sharedNights(s.check_in, s.check_out, group.check_in, group.check_out);
  const gap = budgetGap(s.budget_inr, group.budget_inr);
  const shared = s.interests.filter((i) => owner.interests.includes(i));
  const genderOk = accepts(s.gender_preference, s.gender, owner.gender) && accepts(owner.gender_preference, owner.gender, s.gender);
  const members = group.member_ids.length;
  return [
    { key: "city", label: "Same city", pass: s.city === group.city, value: group.city, detail: `${s.city} vs ${group.city}` },
    { key: "nights", label: `Shared nights ≥ ${MIN_SHARED_NIGHTS}`, pass: nights >= MIN_SHARED_NIGHTS, value: String(nights), detail: `${nights} of ${MIN_SHARED_NIGHTS} needed` },
    // integer comparison avoids floating-point surprises at exactly 40%
    { key: "budget", label: "Budget gap ≤ 40%", pass: gap.diff * 10 <= gap.lower * 4, value: `${gap.pct.toFixed(1)}%`, detail: `${inr(gap.diff)} apart, limit ${inr(gap.lower * BUDGET_TOLERANCE)}` },
    { key: "interests", label: `Shared interests ≥ ${MIN_SHARED_INTERESTS}`, pass: shared.length >= MIN_SHARED_INTERESTS, value: String(shared.length), detail: `${shared.length} of ${MIN_SHARED_INTERESTS} needed` },
    { key: "gender", label: "Gender, both ways", pass: genderOk, value: `${G(s.gender)} ↔ ${G(owner.gender)}`, detail: genderOk ? "Both preferences allow each other" : "One side's preference excludes the other" },
    { key: "size", label: "Room in group", pass: members + 1 <= group.max_size, value: `${members} + you ≤ ${group.max_size}`, detail: `${members} of ${group.max_size} places taken` },
  ];
}

/**
 * Score 0–100, only meaningful for groups that pass all rules.
 * 40% shared interests (share of the seeker's interests the owner also has),
 * 30% shared nights (share of the shorter stay that overlaps),
 * 30% budget closeness (1 at the same budget, 0 at the 40% limit).
 */
export function score(s: SeekerSearch, group: Group, owner: Traveller) {
  const shared = s.interests.filter((i) => owner.interests.includes(i)).length;
  const interestPart = shared / Math.max(1, Math.min(s.interests.length, owner.interests.length));
  const nights = sharedNights(s.check_in, s.check_out, group.check_in, group.check_out);
  const nightPart = nights / Math.min(nightsBetween(s.check_in, s.check_out), nightsBetween(group.check_in, group.check_out));
  const budgetPart = Math.max(0, 1 - budgetGap(s.budget_inr, group.budget_inr).pct / 100 / BUDGET_TOLERANCE);
  return Math.round(100 * (0.4 * Math.min(1, interestPart) + 0.3 * nightPart + 0.3 * budgetPart));
}

// ---------- near misses: exactly one fixable rule fails ----------
export interface Fix { label: string; patch: Partial<SeekerSearch> }
export function suggestFix(failed: RuleResult, s: SeekerSearch, group: Group, owner: Traveller): Fix | null {
  if (failed.key === "budget") {
    const r = budgetRange(group.budget_inr);
    const target = s.budget_inr < r.min ? r.min : r.max;
    return { label: `Set budget to ${inr(target)} → match`, patch: { budget_inr: target } };
  }
  if (failed.key === "interests") {
    const missing = MIN_SHARED_INTERESTS - s.interests.filter((i) => owner.interests.includes(i)).length;
    const add = owner.interests.filter((i) => !s.interests.includes(i)).slice(0, missing);
    if (add.length < missing) return null;
    const label = (id: string) => interests.find((i) => i.interest === id)?.label ?? id;
    return { label: `Add ${add.map((a) => `“${label(a)}”`).join(" + ")} to my interests → match`, patch: { interests: [...s.interests, ...add] } };
  }
  if (failed.key === "nights") {
    // Option A: stretch check-out later. Option B: start check-in earlier. Pick the smaller change that stays in the window.
    const options: { patch: Partial<SeekerSearch>; cost: number; label: string }[] = [];
    const needOutA = addDays(s.check_in > group.check_in ? s.check_in : group.check_in, MIN_SHARED_NIGHTS);
    if (needOutA <= group.check_out && needOutA <= WINDOW_END && needOutA > s.check_out)
      options.push({ patch: { check_out: needOutA }, cost: nightsBetween(s.check_out, needOutA), label: `Extend check-out to ${fmtShort(needOutA)} → match` });
    const needInB = addDays(s.check_out < group.check_out ? s.check_out : group.check_out, -MIN_SHARED_NIGHTS);
    if (needInB >= group.check_in && needInB >= WINDOW_START && needInB < s.check_in)
      options.push({ patch: { check_in: needInB }, cost: nightsBetween(needInB, s.check_in), label: `Move check-in to ${fmtShort(needInB)} → match` });
    options.sort((a, b) => a.cost - b.cost);
    return options[0] ? { label: options[0].label, patch: options[0].patch } : null;
  }
  return null; // city, gender and a full group can't be fixed by tweaking the search
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtShort = (d: string) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}`;
