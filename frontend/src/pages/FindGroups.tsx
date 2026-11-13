// Screen 03 · Search (M3) + Matches (M4) + Filters (G1). All 6 rules shown with real values; near-misses say what to change.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, dayNum, firstName, inr, nightsOf, range, type GenderPref, type Match, type NearMiss, type SearchInput, type SearchResponse } from "../api";
import { cityScene } from "../scenes";
import { Avatar, CostStrip, Field, InterestChips, Loading, Ring, Rules, Scene, useApp, useInterestLabel } from "../ui";
import { splitName } from "./CreateGroup";

const LAST = "tripmate.lastSearch";
export const lastSearch = {
  get: (): { input: SearchInput; search_id: number } | null => { try { return JSON.parse(sessionStorage.getItem(LAST) ?? "null"); } catch { return null; } },
  set: (v: { input: SearchInput; search_id: number }) => { try { sessionStorage.setItem(LAST, JSON.stringify(v)); } catch { /* ignore */ } },
};

export default function FindGroups() {
  const { me, meta, toast } = useApp();
  const label = useInterestLabel();
  const prev = lastSearch.get();
  const [form, setForm] = useState<SearchInput>(() => prev?.input ?? {
    home_city: me?.home_city ?? "", city: "", check_in: "", check_out: "", budget_inr: 0,
    interests: me?.interests ?? [], gender_preference: me?.gender_preference ?? "ANY",
  });
  const [budgetText, setBudgetText] = useState(form.budget_inr ? String(form.budget_inr) : "");
  const [filterInts, setFilterInts] = useState<string[]>([]);
  const [mix, setMix] = useState("");
  const [sort, setSort] = useState("best");
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [intOpen, setIntOpen] = useState(false);
  const intRef = useRef<HTMLDivElement>(null);
  // Close the interests popover on an outside click or Escape.
  useEffect(() => {
    if (!intOpen) return;
    const onDown = (e: MouseEvent) => { if (!intRef.current?.contains(e.target as Node)) setIntOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIntOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [intOpen]);

  async function run(input: SearchInput, opts: { filterInts?: string[]; mix?: string; sort?: string } = {}) {
    setBusy(true); setErr(null);
    try {
      const r = await api<SearchResponse>("/search", { body: { ...input, filter_interests: opts.filterInts ?? filterInts, mix: opts.mix ?? mix, sort: opts.sort ?? sort } });
      setRes(r);
      lastSearch.set({ input, search_id: r.search_id });
    } catch (e) {
      setErr({ field: e instanceof ApiError ? e.field : undefined, msg: (e as Error).message });
      setRes(null);
    } finally { setBusy(false); }
  }
  // Re-run the last search when coming back to this page.
  useEffect(() => { if (prev) void run(prev.input); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function submit() {
    if (!form.city) return setErr({ field: "city", msg: "Pick a destination." });
    if (!form.check_in || !form.check_out) return setErr({ field: "check_in", msg: "Pick your check-in and check-out dates." });
    if (!(+budgetText > 0)) return setErr({ field: "budget_inr", msg: "Enter your budget per person." });
    const input = { ...form, budget_inr: +budgetText };
    setForm(input); setFilterInts([]);
    void run(input, { filterInts: [] });
  }
  function applyFix(patch: Partial<SearchInput>) {
    const input = { ...form, budget_inr: +budgetText || form.budget_inr, ...patch };
    setForm(input);
    if (patch.budget_inr) setBudgetText(String(patch.budget_inr));
    void run(input);
    toast("Search updated — fix applied.");
  }
  const refine = (o: { filterInts?: string[]; mix?: string; sort?: string }) => {
    if (o.filterInts) setFilterInts(o.filterInts);
    if (o.mix !== undefined) setMix(o.mix);
    if (o.sort) setSort(o.sort);
    if (res) void run(res.search, o);
  };

  const nights = form.check_in && form.check_out && form.check_out > form.check_in ? nightsOf(form.check_in, form.check_out) : 0;
  const errAt = (f: string) => err?.field === f || (f === "check_in" && err?.field === "check_out");
  if (!me || !meta) return null;
  const sameLabel = me.gender === "FEMALE" ? "Women only" : "Men only";

  return (
    <>
      <div style={{ padding: "18px 40px", borderBottom: "1px solid var(--line)", background: "rgba(255,255,255,.02)" }}>
        <form className="row" style={{ gap: 8, maxWidth: 1360, margin: "0 auto", alignItems: "flex-start" }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <select className={"in" + (errAt("city") ? " e" : "")} style={{ flex: 1 }} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} title="Destination">
            <option value="">📍 Destination…</option>
            {meta.cities.map((c) => <option key={c.name} value={c.name}>📍 {c.name}</option>)}
          </select>
          <div className={"in" + (errAt("check_in") ? " e" : "")} style={{ flex: 1.5, gap: 4 }} title="Dates (1–20 Apr 2027)">
            📅<input type="date" value={form.check_in} min={meta.window.start} max="2027-04-19" onChange={(e) => setForm({ ...form, check_in: e.target.value })} style={dateStyle} />
            →<input type="date" value={form.check_out} min={form.check_in || "2027-04-02"} max={meta.window.end} onChange={(e) => setForm({ ...form, check_out: e.target.value })} style={dateStyle} />
            {nights > 0 && <span className="r">{nights} nights</span>}
          </div>
          <div className={"in" + (errAt("budget_inr") ? " e" : "")} style={{ flex: 0.9 }} title="Budget per person">
            ₹<input value={budgetText} onChange={(e) => setBudgetText(e.target.value.replace(/\D/g, ""))} placeholder="62000" inputMode="numeric" style={{ background: "none", border: 0, outline: 0, width: "100%" }} /><span className="r">pp</span>
          </div>
          <select className="in" style={{ flex: 1 }} value={form.gender_preference} onChange={(e) => setForm({ ...form, gender_preference: e.target.value as GenderPref })} title="Travel with">
            <option value="SAME_GENDER">{sameLabel}</option><option value="ANY">Anyone</option>
          </select>
          <div ref={intRef} style={{ flex: 1.5, minWidth: 0, position: "relative" }}>
            <button type="button" className={"in int-trigger" + (intOpen ? " f" : "")} onClick={() => setIntOpen(!intOpen)} title={form.interests.map(label).join(", ") || "Interests"} aria-expanded={intOpen}>
              {form.interests.length === 0 ? <span className="mu2">✦ Interests…</span> : (
                <>
                  <span className="int-more">{form.interests.length}</span>
                  <span className="int-text">{form.interests.map(label).join(", ")}</span>
                </>
              )}
              <span className="r">{intOpen ? "▴" : "▾"}</span>
            </button>
            {intOpen && (
              <div className="int-pop" role="dialog" aria-label="Choose interests">
                <div className="int-head">
                  <div><b>Interests</b><span className="mu2"> · {form.interests.length} selected</span></div>
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="lnk" onClick={() => setForm({ ...form, interests: me.interests })}>Use my profile</button>
                    <button type="button" className="lnk" disabled={!form.interests.length} onClick={() => setForm({ ...form, interests: [] })}>Clear</button>
                  </div>
                </div>
                <InterestChips value={form.interests} onChange={(v) => setForm({ ...form, interests: v })} interests={meta.interests} />
                <div className="int-foot">
                  <span className={"hint" + (form.interests.length >= 2 ? " ok" : "")} style={{ margin: 0 }}>
                    {form.interests.length >= 2 ? "✓ " : ""}Groups need 2+ interests shared with the owner
                  </span>
                  <button type="button" className="btn sm bp" onClick={() => setIntOpen(false)}>Done</button>
                </div>
              </div>
            )}
          </div>
          <select className="in" style={{ flex: 0.8 }} value={form.home_city ?? ""} onChange={(e) => setForm({ ...form, home_city: e.target.value })} title="Home city">
            {meta.departure_cities.map((d) => <option key={d.airport} value={d.city}>From {d.city}</option>)}
          </select>
          <button className="btn bp" style={{ padding: "0 26px", height: 40 }} disabled={busy}>Search</button>
        </form>
        {err && <div className="err" style={{ maxWidth: 1360, margin: "8px auto 0" }}>{err.msg}</div>}
      </div>

      <div className="wrap" style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 26, paddingTop: 24 }}>
        <div className="gl rise" style={{ alignSelf: "start", padding: 20 }}>
          <h3>Refine</h3>
          <Field label="Shared interests" style={{ marginTop: 14 }} hint={res ? "Only groups sharing all selected" : "Search first"}>
            <div className="chips">
              {(res?.search.interests ?? form.interests).map((i) => (
                <button key={i} className={"chip" + (filterInts.includes(i) ? " on" : "")} disabled={!res}
                  onClick={() => refine({ filterInts: filterInts.includes(i) ? filterInts.filter((x) => x !== i) : [...filterInts, i] })}>{label(i)}</button>
              ))}
            </div>
          </Field>
          <Field label="Group mix" style={{ marginTop: 16 }}>
            <div className="chips">
              {[["", "Any"], ["ALL_WOMEN", "All women"], ["ALL_MEN", "All men"], ["MIXED", "Mixed"]].map(([v, l]) => (
                <button key={v} className={"chip" + (mix === v ? " on" : "")} disabled={!res} onClick={() => refine({ mix: v })}>{l}</button>
              ))}
            </div>
          </Field>
          <Field label="Sort" style={{ marginTop: 16 }}>
            <select className="in" value={sort} onChange={(e) => refine({ sort: e.target.value })}>
              <option value="best">Best match</option><option value="earliest">Earliest check-in</option><option value="budget">Closest budget</option>
            </select>
          </Field>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <div className="eyebrow" style={{ fontSize: 9.5 }}>How we score</div>
            <div className="mu" style={{ marginTop: 10, fontSize: 12 }}>
              {[["Shared interests", 40, "#f0c48a"], ["Shared nights", 30, "#cfd6e4"], ["Budget closeness", 30, "#8fb3c9"]].map(([l, w, c], i) => (
                <div key={l as string} style={{ marginTop: i ? 8 : 0 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}><span>{l}</span><b style={{ color: "#fff" }}>{w}%</b></div>
                  <div className="meter"><i style={{ width: `${w}%`, background: c as string }} /></div>
                </div>
              ))}
              <div className="mu2" style={{ marginTop: 10, fontSize: 11 }}>Only groups passing all 6 rules are shown. Ties → more shared nights, then earliest check-in.</div>
            </div>
          </div>
        </div>

        <div>
          {busy && !res && <Loading text="Checking every group against the 6 rules…" />}
          {!res && !busy && (
            <div className="gl empty rise">
              <h2>Where are you <em>headed?</em></h2>
              <p className="sub">Pick a city, your dates in 1–20 April 2027, a budget and your interests. We'll show only groups that fit on all 6 rules.</p>
            </div>
          )}
          {res && (
            <>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
                <h2><em>{res.results.length} group{res.results.length === 1 ? "" : "s"}</em> fit you</h2>
                <span className="mu2" style={{ fontSize: 12 }}>{res.results.length < res.total_matches ? `${res.total_matches - res.results.length} hidden by filters · ` : ""}Only groups passing all 6 rules appear</span>
              </div>
              {res.results.length === 0 && (
                <div className="gl empty">
                  <h2>No groups fit <em>yet</em></h2>
                  <p className="sub">{res.near_misses.length ? "Try one of the quick fixes below, or start your own group." : "Try other dates, add interests, or start your own group so others can find you."}</p>
                  <Link to="/create" className="btn bp" style={{ marginTop: 18 }}>Create a group instead</Link>
                </div>
              )}
              {res.results.map((m, i) => <MatchCard key={m.id} m={m} i={i} search={res.search} searchId={res.search_id} best={i === 0 && sort === "best"}
                onRequested={() => setRes({ ...res, results: res.results.map((x) => (x.id === m.id ? { ...x, my_request: "PENDING" } : x)) })} />)}
              {res.near_misses.length > 0 && <NearMisses list={res.near_misses} onFix={applyFix} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}
const dateStyle: CSSProperties = { background: "none", border: 0, outline: 0, color: "inherit", minWidth: 0, flex: 1 };

function MatchCard({ m, i, best, search, searchId, onRequested }: { m: Match; i: number; best: boolean; search: SearchInput; searchId: number; onRequested: () => void }) {
  const { toast } = useApp();
  const label = useInterestLabel();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  async function interested() {
    setBusy(true);
    try { await api(`/groups/${m.id}/requests`, { body: { search_id: searchId } }); onRequested(); toast(`Request sent to ${firstName(m.owner.name)}.`); }
    catch (e) { toast((e as Error).message, true); } finally { setBusy(false); }
  }
  // timeline: both stays drawn on one axis
  const lo = Math.min(dayNum(search.check_in), dayNum(m.check_in)), hi = Math.max(dayNum(search.check_out), dayNum(m.check_out));
  const pos = (a: string, b: string) => ({ left: `${((dayNum(a) - lo) / (hi - lo)) * 100}%`, width: `${((dayNum(b) - dayNum(a)) / (hi - lo)) * 100}%` });
  const ovIn = dayNum(search.check_in) > dayNum(m.check_in) ? search.check_in : m.check_in;
  const ovOut = dayNum(search.check_out) < dayNum(m.check_out) ? search.check_out : m.check_out;
  const ownerInts = new Set(m.owner.interests);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={"gl rise" + (best ? " hi" : "")} style={{ ["--i" as string]: i + 1, display: "grid", gridTemplateColumns: "190px 1fr 280px", gap: 22, padding: 16, marginTop: i ? 14 : 0 } as CSSProperties}>
      <Scene kind={cityScene[m.city] ?? "sunset"} style={{ minHeight: 210 }}><div className="lab"><span className="glassbadge">{m.open_places} spot{m.open_places === 1 ? "" : "s"} open</span></div></Scene>
      <div style={{ paddingTop: 4, minWidth: 0 }}>
        <div className="row">{best && <span className="pill pb">★ Best match</span>}<span className="pill pg"><span className="dot" />All 6 rules</span></div>
        <h2 style={{ marginTop: 10 }}>{splitName(m.name)}</h2>
        <div className="mu" style={{ fontSize: 12.5, marginTop: 3 }}>
          {m.city} · {range(m.check_in, m.check_out)} · by <Link to={`/travellers/${m.owner.id}`} style={{ color: "#fff", fontWeight: 600 }}>{firstName(m.owner.name)}</Link> · {m.members.length} member{m.members.length > 1 ? "s" : ""} · wants {m.max_size} · ~{inr(m.budget_inr)} pp
        </div>
        <div className="row" style={{ marginTop: 10, gap: 6 }}>
          {m.members.map((p) => <Link key={p.id} to={`/travellers/${p.id}`}><Avatar id={p.id} name={p.name} size={24} /></Link>)}
          {Array.from({ length: m.open_places }, (_, k) => <div key={k} className="av ghost" style={{ width: 24, height: 24 }}>+</div>)}
          <span className="mu2" style={{ fontSize: 11.5 }}>your seat is waiting</span>
        </div>
        <div className="chips" style={{ marginTop: 12 }}>
          {[...ownerInts].map((x) => <span key={x} className={"chip" + (m.shared_interests.includes(x) ? " sh" : "")}>{m.shared_interests.includes(x) ? "✓ " : ""}{label(x)}</span>)}
        </div>
        <div className="tl">
          <div className="ov" style={pos(ovIn, ovOut)}><span>{m.shared_nights} shared nights</span></div>
          <div className="bar" style={{ top: 0, ...pos(search.check_in, search.check_out), background: "linear-gradient(90deg,#4f6d8a,#7d97b0)" }}>You · {range(search.check_in, search.check_out)}</div>
          <div className="bar" style={{ top: 23, ...pos(m.check_in, m.check_out), background: "linear-gradient(90deg,#c27d45,#f0c48a)", animationDelay: ".6s" }}>Group · {range(m.check_in, m.check_out)}</div>
        </div>
        {m.cost_preview && <CostStrip p={m.cost_preview} checkIn={m.check_in} checkOut={m.check_out} />}
        {m.itinerary && <div className="mu2" style={{ fontSize: 12, marginTop: 14 }}>{m.itinerary}</div>}
        <div className="row" style={{ marginTop: 14 }}>
          {m.my_request === "PENDING" ? <span className="pill pa">✓ Request sent · waiting for owner</span>
            : m.my_request === "REJECTED" ? <span className="pill pr">Owner declined</span>
            : <button className="btn bp sm" onClick={interested} disabled={busy}>{busy ? "Sending…" : "I'm interested"}</button>}
          <button className="btn sm" onClick={() => nav(`/groups/${m.id}`)}>View group</button>
        </div>
      </div>
      <div className="divv">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}><h3>Why it's a match</h3><Ring value={m.score} delay={i * 0.15} /></div>
        <Rules rules={m.rules} />
      </div>
    </div>
  );
}

function NearMisses({ list, onFix }: { list: NearMiss[]; onFix: (p: Partial<SearchInput>) => void }) {
  return (
    <div className="gl rise" style={{ ["--i" as string]: 3, marginTop: 22, borderColor: "rgba(255,193,107,.35)", background: "rgba(240,196,138,.05)" } as CSSProperties}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><span className="pill pa">Almost a match</span><h2 style={{ marginTop: 8 }}>Change one thing, <em>unlock these</em></h2></div>
        <span className="mu2" style={{ fontSize: 12 }}>Hidden from results because one rule fails</span>
      </div>
      <div className="grid2" style={{ marginTop: 14 }}>
        {list.map((n) => (
          <div className="gl" style={{ padding: 16 }} key={n.id}>
            <div className="row"><Link to={`/groups/${n.id}`} style={{ fontWeight: 600 }}>{n.name}</Link><span className="mu2" style={{ fontSize: 12 }}>{n.city} · {range(n.check_in, n.check_out)}</span></div>
            <div className="rule"><span className="tick x">✕</span>{n.failed.label.replace(/ [≥≤].*/, "")}: {n.failed.detail}</div>
            <button className="btn sm bwarn" style={{ marginTop: 8, whiteSpace: "normal", height: "auto", minHeight: 34, padding: "8px 15px" }} onClick={() => onFix(n.fix.patch)}>{n.fix.label}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
