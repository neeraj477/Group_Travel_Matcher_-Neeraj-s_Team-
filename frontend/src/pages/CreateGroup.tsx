// Screen 02 · Create group post (M2). City and dates are limited to the dataset, with clear errors.
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, dLong, firstName, inr, nightsOf, range, type GroupSummary } from "../api";
import { cityScene } from "../scenes";
import { Avatar, Field, Scene, Seg, useApp, useInterestLabel } from "../ui";

const DRAFT = "tripmate.groupDraft";
interface Draft { name: string; city: string; check_in: string; check_out: string; max_size: number; budget: string; itinerary: string }
const empty: Draft = { name: "", city: "", check_in: "", check_out: "", max_size: 3, budget: "", itinerary: "" };

/** Same checks the backend makes, shown as you type. The backend re-checks on publish. */
function check(d: Draft, start: string, end: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (d.check_in && (d.check_in < start || d.check_in >= end)) e.check_in = "We only have hotel data for 1–20 April 2027. Pick a check-in between 1 and 19 Apr.";
  if (d.check_out && (d.check_out > end || d.check_out <= start)) e.check_out = "We only have hotel data for 1–20 April 2027. Pick a check-out on or before 20 Apr.";
  else if (d.check_in && d.check_out && d.check_out <= d.check_in) e.check_out = "Check-out must be after check-in.";
  if (d.budget && !(+d.budget > 0)) e.budget_inr = "Budget must be above ₹0.";
  return e;
}

export default function CreateGroup() {
  const { me, meta, toast } = useApp();
  const label = useInterestLabel();
  const nav = useNavigate();
  const [d, setD] = useState<Draft>(() => { try { return { ...empty, ...JSON.parse(localStorage.getItem(DRAFT) ?? "{}") }; } catch { return empty; } });
  const [serverErr, setServerErr] = useState<Record<string, string>>({});
  const [range40, setRange40] = useState<{ min: number; max: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD((x) => ({ ...x, [k]: v })); setServerErr({}); };

  const errs = { ...check(d, meta?.window.start ?? "2027-04-01", meta?.window.end ?? "2027-04-20"), ...serverErr };
  const nights = d.check_in && d.check_out && !errs.check_in && !errs.check_out ? nightsOf(d.check_in, d.check_out) : 0;

  useEffect(() => {
    const b = +d.budget;
    if (!(b > 0)) { setRange40(null); return; }
    const t = setTimeout(() => api<{ min: number; max: number }>(`/budget-range?budget=${b}`).then(setRange40).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [d.budget]);

  async function publish(e: FormEvent) {
    e.preventDefault();
    const missing: Record<string, string> = {};
    if (d.name.trim().length < 3) missing.name = "Give the group a name (3+ characters).";
    if (!d.city) missing.city = "Pick a destination.";
    if (!d.check_in) missing.check_in = "Pick a check-in date.";
    if (!d.check_out) missing.check_out = "Pick a check-out date.";
    if (!d.budget) missing.budget_inr = "Enter an approximate budget per person.";
    if (Object.keys(missing).length || Object.keys(errs).length) { setServerErr({ ...missing }); return; }
    setBusy(true);
    try {
      const g = await api<GroupSummary>("/groups", { body: { name: d.name, city: d.city, check_in: d.check_in, check_out: d.check_out, max_size: d.max_size, budget_inr: +d.budget, itinerary: d.itinerary } });
      localStorage.removeItem(DRAFT);
      toast("Group published — seekers can find it now.");
      nav(`/groups/${g.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.field) setServerErr({ [err.field]: err.message });
      else toast((err as Error).message, true);
    } finally { setBusy(false); }
  }

  if (!me || !meta) return null;
  const others = d.max_size - 1;
  return (
    <form className="wrap" style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 30, alignItems: "start" }} onSubmit={publish} noValidate>
      <div className="gl rise" style={{ padding: 30 }}>
        <div className="eyebrow">New group</div>
        <h1 style={{ marginTop: 8 }}>Start a <em>group trip</em></h1>
        <p className="sub">People with matching dates, budget and interests will find you.</p>
        <Field label="Group name" error={errs.name} style={{ marginTop: 22 }}>
          <input className={"in" + (errs.name ? " e" : "")} value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Kyoto Temples & Street Food 🍜" maxLength={80} />
        </Field>
        <div className="grid2" style={{ marginTop: 16 }}>
          <Field label={`Destination · ${meta.cities.length} cities in our data`} error={errs.city} hint={<>From <code>GET /api/meta</code> · we only have hotels in these cities</>} style={{ gridColumn: "1 / -1" }}>
            <div className="tiles">
              {meta.cities.map((c) => (
                <Scene key={c.name} kind={cityScene[c.name] ?? "sunset"} className={"tile" + (d.city === c.name ? " sel" : "")}>
                  <button type="button" onClick={() => set("city", c.name)} style={{ position: "absolute", inset: 0, zIndex: 3, background: "none", border: 0, cursor: "pointer" }} aria-label={c.name} />
                  {d.city === c.name && <div className="lab"><span className="glassbadge" style={{ padding: "3px 8px" }}>✓</span></div>}
                  <div className="bl"><b style={{ fontWeight: 600 }}>{c.name}</b><div className="mu" style={{ fontSize: 10.5 }}>{c.country}</div></div>
                </Scene>
              ))}
            </div>
          </Field>
          <Field label="Total group size (incl. you)" hint={others === 0 ? "Just you — nobody else can join" : `Looking for ${others} more ${others === 1 ? "person" : "people"}`}>
            <Seg value={d.max_size} onChange={(v) => set("max_size", v)} options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
          </Field>
          <Field label="Check-in" error={errs.check_in}>
            <input type="date" className={"in" + (errs.check_in ? " e" : "")} value={d.check_in} min={meta.window.start} max="2027-04-19" onChange={(e) => set("check_in", e.target.value)} />
          </Field>
          <Field label="Check-out" error={errs.check_out} hint={nights ? `${nights} night${nights > 1 ? "s" : ""} · must fall within 1–20 Apr 2027` : "Must fall within 1–20 Apr 2027"}>
            <input type="date" className={"in" + (errs.check_out ? " e" : "")} value={d.check_out} min={d.check_in || "2027-04-02"} max={meta.window.end} onChange={(e) => set("check_out", e.target.value)} />
          </Field>
          <Field label="Budget per person (whole trip)" error={errs.budget_inr} hint={range40 ? `Matches ${inr(range40.min)} – ${inr(range40.max)} (40% rule)` : "Approximate, in ₹"}>
            <div className={"in" + (errs.budget_inr ? " e" : "")} style={{ padding: 0 }}>
              <span style={{ paddingLeft: 13 }}>₹</span>
              <input value={d.budget} onChange={(e) => set("budget", e.target.value.replace(/\D/g, ""))} placeholder="60000" inputMode="numeric" style={{ background: "none", border: 0, outline: 0, height: "100%", flex: 1 }} />
            </div>
          </Field>
          <Field label="Interests · from your profile" hint="Seekers need 2+ of these in common with you.">
            <div className="chips">{me.interests.map((i) => <span className="chip on" key={i}>{label(i)}</span>)}</div>
          </Field>
        </div>
        <Field label="Proposed itinerary" style={{ marginTop: 16 }}>
          <textarea className="in ta" value={d.itinerary} onChange={(e) => set("itinerary", e.target.value)} placeholder="Day 1 Fushimi Inari at sunrise · Day 2 Nishiki Market food crawl · …" maxLength={2000} />
        </Field>
        <div className="row" style={{ marginTop: 22 }}>
          <button type="button" className="btn" onClick={() => { localStorage.setItem(DRAFT, JSON.stringify(d)); toast("Draft saved on this device."); }}>Save draft</button>
          <button className="btn bp" style={{ flex: 1 }} disabled={busy}>{busy ? "Publishing…" : "Publish group post"}</button>
        </div>
      </div>

      <div className="rise" style={{ ["--i" as string]: 2, position: "sticky", top: 90 } as React.CSSProperties}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Live preview · what seekers see</div>
        <div className="gl hi" style={{ padding: 0, overflow: "hidden" }}>
          <Scene kind={cityScene[d.city] ?? "sunset"} style={{ height: 210, borderRadius: 0 }}>
            <div className="lab"><span className="glassbadge">{others} spot{others === 1 ? "" : "s"} open</span></div>
            <div className="bl">
              <h2>{d.name ? splitName(d.name) : <span className="mu">Your group name</span>}</h2>
              <div className="mu" style={{ fontSize: 12, marginTop: 3 }}>
                {d.city || "Destination"} · {d.check_in && d.check_out && nights ? `${range(d.check_in, d.check_out)} 2027 · ${nights} night${nights > 1 ? "s" : ""}` : "Pick your dates"}
              </div>
            </div>
          </Scene>
          <div style={{ padding: "18px 20px" }}>
            <div className="row">
              <Avatar id={me.id} name={me.name} />
              <div><b style={{ fontWeight: 600 }}>{firstName(me.name)}</b><div className="mu2" style={{ fontSize: 11.5 }}>Owner · {me.home_city} · {me.gender_preference === "SAME_GENDER" ? (me.gender === "FEMALE" ? "women only" : "men only") : "anyone"}</div></div>
              <span className="sp" />
              <div style={{ textAlign: "right" }}><div className="mu2" style={{ fontSize: 11 }}>Budget</div><b className="num" style={{ fontWeight: 600 }}>{d.budget ? "~" + inr(+d.budget) : "—"}</b></div>
            </div>
            <div className="chips" style={{ marginTop: 14 }}>{me.interests.map((i) => <span className="chip" key={i}>{label(i)}</span>)}</div>
            {d.itinerary && <div className="mu" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.6 }}>{d.itinerary}</div>}
            {d.check_in && !errs.check_in && <div className="mu2" style={{ fontSize: 11.5, marginTop: 12 }}>Check-in {dLong(d.check_in)} · times in {meta.cities.find((c) => c.name === d.city)?.timezone ?? "local time"}</div>}
          </div>
        </div>
        {(errs.check_in || errs.check_out || errs.city) && (
          <div className="gl" style={{ marginTop: 16, borderColor: "rgba(255,107,138,.35)" }}>
            <h3 style={{ color: "#ffb3c4" }}>Fix before publishing</h3>
            {[errs.city, errs.check_in, errs.check_out].filter(Boolean).map((m) => <div className="err" key={m}>{m}</div>)}
          </div>
        )}
      </div>
    </form>
  );
}

/** "Kyoto Temples & Street Food" → "Kyoto Temples & <em>Street Food</em>" (the mockup's two-tone title). */
export function splitName(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return <em>{name}</em>;
  const k = Math.ceil(words.length / 2);
  return <>{words.slice(0, k).join(" ")} <em>{words.slice(k).join(" ")}</em></>;
}
