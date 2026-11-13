// Screen 05 · Common Group Page (M6) and 06 · Book → confirm → locked. Non-members see the public group view.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api, dLong, firstName, inr, paise, range, type Booking, type GroupDetail, type HotelResult, type HotelsResponse, type Message, type RoomOption,
} from "../api";
import { cityScene, hotelScenes } from "../scenes";
import { Avatar, Confetti, CostStrip, CountUp, Loading, Modal, Scene, useApp, useInterestLabel } from "../ui";
import { splitName } from "./CreateGroup";
import { lastSearch } from "./FindGroups";

export default function GroupPage() {
  const { id } = useParams();
  const { me } = useApp();
  const [g, setG] = useState<GroupDetail | null>(null);
  const [err, setErr] = useState("");
  // search_id lets the backend show the cost preview as a share of the viewer's own budget
  const load = useCallback(() => {
    const sid = lastSearch.get()?.search_id;
    return api<GroupDetail>(`/groups/${id}${sid ? `?search_id=${sid}` : ""}`).then(setG).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { void load(); }, [load, me?.id]);
  if (err) return <div className="wrap"><div className="gl empty"><h2>{err}</h2><Link to="/find" className="btn" style={{ marginTop: 16 }}>Find groups</Link></div></div>;
  if (!g) return <Loading />;
  return g.is_member ? <CommonPage g={g} reload={load} /> : <PublicGroup g={g} reload={load} />;
}

const heroScene = (city: string) => (city === "Kyoto" ? "pagoda" : cityScene[city] ?? "sunset");

// ---------------------------------------------------------------- public view (G2-style details for seekers)
function PublicGroup({ g, reload }: { g: GroupDetail; reload: () => void }) {
  const { me, toast } = useApp();
  const label = useInterestLabel();
  const last = lastSearch.get();
  const [busy, setBusy] = useState(false);
  async function interested() {
    if (!last) return;
    setBusy(true);
    try { await api(`/groups/${g.id}/requests`, { body: { search_id: last.search_id } }); toast(`Request sent to ${firstName(g.owner.name)}.`); reload(); }
    catch (e) { toast((e as Error).message, true); } finally { setBusy(false); }
  }
  return (
    <>
      <Scene kind={heroScene(g.city)} style={{ height: 240, borderRadius: 0 }}>
        <div className="lab" style={{ left: 40, top: 20 }}><span className="glassbadge">{g.booked ? "Booked · closed" : g.open_places ? `${g.open_places} spot${g.open_places > 1 ? "s" : ""} open` : "Full"}</span></div>
        <div className="bl" style={{ left: 40, right: 40, bottom: 22 }}>
          <div className="eyebrow">Group post · {g.city}, {g.country} · {range(g.check_in, g.check_out)} 2027 · {g.nights} nights</div>
          <h1 style={{ marginTop: 6 }}>{splitName(g.name)}</h1>
        </div>
      </Scene>
      <div className="wrap" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
        <div className="gl rise">
          <h3>Proposed itinerary</h3>
          <p style={{ marginTop: 10, lineHeight: 1.7, color: "#d6daf0" }}>{g.itinerary || "No itinerary yet."}</p>
          <div className="grid2" style={{ marginTop: 22 }}>
            <div><div className="lbl">Dates</div>{dLong(g.check_in)} → {dLong(g.check_out)}<div className="mu2" style={{ fontSize: 11.5 }}>Local time · {g.timezone}</div></div>
            <div><div className="lbl">Budget per person</div>~{inr(g.budget_inr)}</div>
            <div><div className="lbl">Group size</div>{g.members.length} of {g.max_size} (owner included)</div>
            <div><div className="lbl">Owner travels with</div>{g.owner.gender_preference === "SAME_GENDER" ? (g.owner.gender === "FEMALE" ? "Women only" : "Men only") : "Anyone"}</div>
          </div>
          {g.cost_preview && <><div className="lbl" style={{ marginTop: 22 }}>Stay cost per person</div><CostStrip p={g.cost_preview} checkIn={g.check_in} checkOut={g.check_out} /></>}
          <div className="lbl" style={{ marginTop: 22 }}>Owner's interests · you need 2+ in common</div>
          <div className="chips">{g.owner.interests.map((i) => <span key={i} className={"chip" + (last?.input.interests.includes(i) ? " sh" : "")}>{label(i)}</span>)}</div>
        </div>
        <div className="gl rise" style={{ ["--i" as string]: 1, alignSelf: "start" } as CSSProperties}>
          <h3>Members</h3>
          {g.members.map((p) => (
            <Link key={p.id} to={`/travellers/${p.id}`} className="row" style={{ marginTop: 14 }}>
              <Avatar id={p.id} name={p.name} />
              <div><b style={{ fontWeight: 600 }}>{p.name}</b> {p.id === g.owner.id && <span className="pill pb">Owner</span>}<div className="mu2" style={{ fontSize: 11.5 }}>{p.home_city} · {p.age} · view profile →</div></div>
            </Link>
          ))}
          <div style={{ marginTop: 20 }}>
            {!me ? <Link to="/welcome" className="btn bp" style={{ width: "100%" }}>Sign up to join</Link>
              : g.my_request === "PENDING" ? <span className="pill pa">✓ Request sent · waiting for {firstName(g.owner.name)}</span>
              : g.my_request === "REJECTED" ? <span className="pill pr">The owner declined your request</span>
              : g.booked || g.open_places === 0 ? <span className="pill pn">This group is closed</span>
              : last ? <button className="btn bp" style={{ width: "100%" }} disabled={busy} onClick={interested}>{busy ? "Checking…" : "I'm interested"}</button>
              : <Link to="/find" className="btn" style={{ width: "100%" }}>Search first to check you fit</Link>}
            {last && !g.my_request && !g.booked && g.open_places > 0 && <div className="hint">We'll check this group against your last search ({last.input.city}, {range(last.input.check_in, last.input.check_out)}).</div>}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- the common group page
function CommonPage({ g, reload }: { g: GroupDetail; reload: () => void }) {
  const { me, toast, refreshMe } = useApp();
  const nav = useNavigate();
  const [leaving, setLeaving] = useState<"ask" | "busy" | "locked" | null>(null);
  function openChat() {
    setLeaving(null);
    const el = document.getElementById("group-chat-input");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el?.focus(), 400);
  }
  async function leave() {
    setLeaving("busy");
    try {
      await api(`/groups/${g.id}/leave`, { body: {} });
      toast(`You've left “${g.name}”. Hope to see you on another trip soon! 👋`);
      void refreshMe();
      nav("/my");
    } catch (e) { toast((e as Error).message, true); setLeaving(null); }
  }
  const [h, setH] = useState<HotelsResponse | null>(null);
  const [sort, setSort] = useState("per_person");
  const [budgetOnly, setBudgetOnly] = useState(false);
  const [confirm, setConfirm] = useState<{ hotel: HotelResult; opt: RoomOption } | null>(null);
  const [booked, setBooked] = useState<{ b: Booking; fresh: boolean } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ sort });
    return api<HotelsResponse>(`/groups/${g.id}/hotels?${q}`).then(setH).catch((e) => toast(e.message, true));
  }, [g.id, sort, toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), 6000); return () => clearInterval(t); }, [load]); // see other members' saves

  const guests = g.members.length;
  const shown = useMemo(() => (h?.results ?? []).filter((r) => !budgetOnly || !r.best || r.best.per_member_inr <= h!.lowest_budget), [h, budgetOnly]);
  const bookable = shown.filter((r) => r.best);
  const byRoom = useMemo(() => new Map((h?.results ?? []).flatMap((r) => r.options.map((o) => [o.room_id, { hotel: r, opt: o }] as const))), [h]);
  const saved = useMemo(() => Object.entries(h?.saves ?? {}).map(([room, who]) => ({ room, who, ...byRoom.get(room)! })).filter((x) => x.hotel)
    .sort((a, b) => b.who.length - a.who.length || a.opt.per_member_inr - b.opt.per_member_inr), [h, byRoom]);
  const choice = saved.find((s) => s.room === selected) ?? saved[0];
  const booking = h?.booking ?? g.booking;
  const myShare = booking?.shares.find((s) => s.traveller_id === me?.id)?.amount_paise;

  async function toggleSave(room: string) {
    try { const r = await api<{ saves: Record<string, string[]> }>(`/groups/${g.id}/saved`, { body: { room_id: room } }); setH((x) => (x ? { ...x, saves: r.saves } : x)); }
    catch (e) { toast((e as Error).message, true); }
  }
  async function book() {
    if (!confirm) return;
    try {
      const b = await api<Booking>(`/groups/${g.id}/booking`, { body: { room_id: confirm.opt.room_id } });
      setConfirm(null); setBooked({ b, fresh: true }); void load(); reload();
    } catch (e) { toast((e as Error).message, true); setConfirm(null); void load(); }
  }

  const steps = [
    { label: "Group formed", done: guests >= 2, active: guests < 2 },
    { label: "Everyone approved", done: guests >= 2 && g.pending_count === 0, active: false },
    { label: "Pick a stay together", done: !!booking, active: !booking && guests >= 1 },
    { label: "Booked & locked", done: !!booking, active: false },
  ];
  return (
    <>
      <Scene kind="fjord" style={{ height: 240, borderRadius: 0 }}>
        <div className="bl" style={{ left: 40, right: 40, bottom: 22 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <div><div className="eyebrow">Group page · {g.city} · {range(g.check_in, g.check_out)} 2027 · {g.nights} nights</div><h1 style={{ marginTop: 6 }}>{splitName(g.name)}</h1></div>
            <div className="row">
              {g.members.map((p, i) => <Link key={p.id} to={`/travellers/${p.id}`}><Avatar id={p.id} name={p.name} style={{ marginLeft: i ? -12 : 0 }} /></Link>)}
              <span className="glassbadge">{guests} member{guests > 1 ? "s" : ""} · times in {g.timezone}</span>
            </div>
          </div>
        </div>
      </Scene>
      <div className="wrap" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, paddingTop: 24 }}>
        {g.is_owner && g.pending_count > 0 && (
          <Link to={`/groups/${g.id}/requests`} className="gl rise" style={{ gridColumn: "1 / -1", padding: "12px 20px", borderColor: "rgba(255,107,138,.45)" }}>
            <div className="row"><span className="bell">🔔<b>{g.pending_count}</b></span><span style={{ marginLeft: 8 }}>{g.pending_count} join request{g.pending_count > 1 ? "s" : ""} waiting for you</span><span className="sp" /><span className="btn sm">Review →</span></div>
          </Link>
        )}
        <div className="gl rise" style={{ gridColumn: "1 / -1", padding: "14px 20px", display: "flex", alignItems: "center" }}>
          {steps.map((s, i) => (
            <div key={s.label} className="row" style={{ gap: 0, flex: i < steps.length - 1 ? 1 : "none" }}>
              <div className="row" style={{ gap: 8, flex: "none" }}>
                <span className="tick" style={s.done ? {} : s.active ? { background: "#f0c48a", color: "#1a1208", boxShadow: "0 0 0 5px rgba(240,196,138,.2)" } : { background: "rgba(255,255,255,.08)", color: "var(--mu2)" }}>{s.done ? "✓" : i + 1}</span>
                <span style={{ fontSize: 12.5, color: s.done || s.active ? "#fff" : "var(--mu2)", fontWeight: s.active ? 600 : 400 }}>{s.label === "Group formed" && !s.done ? "Waiting for members" : s.label}</span>
              </div>
              {i < steps.length - 1 && <div style={{ flex: 1, height: 2, margin: "0 14px", borderRadius: 2, background: s.done ? (steps[i + 1].done ? "#7fd6a8" : "linear-gradient(90deg,#7fd6a8,#f0c48a)") : "rgba(255,255,255,.1)" }} />}
            </div>
          ))}
          <span className="pill pg" style={{ marginLeft: 18 }}>🔒 Dates locked</span>
          <span className={"pill " + (booking ? "pg" : "pa")} style={{ marginLeft: 6 }}>{booking ? "🔒 Stay booked" : "◐ Stay: up for vote"}</span>
        </div>

        <div>
          {booking && <BookedBanner b={booking} onOpen={() => setBooked({ b: booking, fresh: false })} onLeave={g.is_owner ? undefined : () => setLeaving("locked")} />}
          <div className="row" style={{ justifyContent: "space-between", margin: "4px 0 12px", flexWrap: "wrap" }}>
            <h2>Stays for <em>your group</em></h2>
            <div className="row" style={{ gap: 6 }}>
              <span className="chip on">{guests} guest{guests > 1 ? "s" : ""} · {g.nights} nights</span>
              <select className="in" style={{ height: 29, width: "auto", fontSize: 12.5 }} value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="per_person">Sort: per person</option><option value="rating">Sort: guest rating</option><option value="stars">Sort: stars</option>
              </select>
              {h && <button className={"chip" + (budgetOnly ? " on" : "")} onClick={() => setBudgetOnly(!budgetOnly)}>≤ {inr(h.lowest_budget)} pp</button>}
            </div>
          </div>
          {!h ? <Loading text="Pricing stays for your dates…" /> : shown.length === 0 ? (
            <div className="gl empty"><h2>No stays fit</h2><p className="sub">Nothing is free on every night within this budget. Turn off the budget filter.</p></div>
          ) : shown.map((r, i) => (
            <HotelCard key={r.hotel.hotel_id} r={r} i={i} n={bookable.indexOf(r) + 1} g={g} saves={h.saves} lowest={h.lowest_budget} locked={!!booking} onSave={toggleSave} />
          ))}
          {h && <MapCard hotels={bookable.slice(0, 3)} all={h.results} city={g.city} saves={h.saves} guests={guests} />}
        </div>

        <div>
          <div className="gl hi rise" style={{ ["--i" as string]: 1 } as CSSProperties}>
            <h3>Group alignment</h3><div className="mu2" style={{ fontSize: 12, marginTop: 2 }}>Who saved what · tap a row to choose it</div>
            {saved.length === 0 && <div className="mu" style={{ fontSize: 12.5, marginTop: 16 }}>Nobody has saved a stay yet. Tap “☆ Save option” on the stays you like — everyone sees it here.</div>}
            <div style={{ marginTop: 16, fontSize: 12.5 }}>
              {saved.map((s, i) => (
                <button key={s.room} onClick={() => setSelected(s.room)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: 0, cursor: "pointer", marginTop: i ? 14 : 0, padding: 0, opacity: choice?.room === s.room ? 1 : 0.65 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}><span>{choice?.room === s.room ? "● " : "○ "}{s.hotel.hotel.name} <span className="mu2">· {s.opt.room_name}</span></span><b className="num">{s.who.length} / {guests}</b></div>
                  <div className="meter"><i style={{ width: `${(s.who.length / guests) * 100}%`, background: s.who.length === guests ? "#7fd6a8" : "#f0c48a" }} /></div>
                </button>
              ))}
            </div>
            {booking ? (
              <div style={{ marginTop: 18, padding: 14, borderRadius: 4, background: "rgba(62,230,168,.08)", border: "1px solid rgba(62,230,168,.3)" }}><b style={{ color: "#8ff0c9", fontWeight: 600 }}>Booked & locked 🔒</b><div className="mu" style={{ fontSize: 12, marginTop: 3 }}>{booking.hotel.name} · {booking.id}</div></div>
            ) : choice && (choice.who.length === guests ? (
              <div style={{ marginTop: 18, padding: 14, borderRadius: 4, background: "rgba(62,230,168,.08)", border: "1px solid rgba(62,230,168,.3)" }}><b style={{ color: "#8ff0c9", fontWeight: 600 }}>Everyone agrees 🎉</b><div className="mu" style={{ fontSize: 12, marginTop: 3 }}>Any member can finalise. Once booked, it's locked.</div></div>
            ) : (
              <div style={{ marginTop: 18, padding: 14, borderRadius: 4, background: "rgba(240,196,138,.06)", border: "1px solid rgba(240,196,138,.3)" }}><b style={{ color: "var(--amb)", fontWeight: 600 }}>Not everyone has saved this yet</b><div className="mu" style={{ fontSize: 12, marginTop: 3 }}>Agree in chat first — any member can still finalise.</div></div>
            ))}
            {!booking && <button className="btn bp" style={{ width: "100%", marginTop: 14, height: 44 }} disabled={!choice || !choice.opt.available} onClick={() => choice && setConfirm({ hotel: choice.hotel, opt: choice.opt })}>Finalise booking for the group</button>}
          </div>
          <Chat groupId={g.id} meId={me!.id} members={g.members.map((m) => ({ id: m.id, name: m.name }))} />
          {!g.is_owner && !booking && (
            <button className="btn bleave" style={{ width: "100%", marginTop: 16 }} onClick={() => setLeaving("ask")}>Leave group</button>
          )}
        </div>
      </div>

      {booking && (leaving === "locked" || leaving === "busy") && (
        <Modal onClose={() => leaving === "locked" && setLeaving(null)} width={460}>
          <div style={{ padding: "26px 28px" }}>
            <div className="eyebrow" style={{ color: "#ff9fb3" }}>Leave group</div>
            <h2 style={{ marginTop: 8 }}>Your stay is locked 🔒</h2>
            <p className="mu" style={{ marginTop: 10, lineHeight: 1.6, fontSize: 13.5 }}>
              The stay at <b style={{ color: "#fff", fontWeight: 600 }}>{booking.hotel.name}</b> is already booked for the group, and the booking won't change if you leave.
              {myShare !== undefined && <> Your share (<b style={{ color: "#fff", fontWeight: 600 }}>{paise(myShare)}</b>) stays on it, so please settle it with your group.</>}
              {" "}{firstName(g.owner.name)} will get a friendly note that you've left.
            </p>
            <div className="row" style={{ marginTop: 22 }}>
              <button className="btn bleave solid" style={{ flex: 1 }} disabled={leaving === "busy"} onClick={leave}>{leaving === "busy" ? "Leaving…" : "Confirm leave"}</button>
              <button className="btn bp" style={{ flex: 1 }} disabled={leaving === "busy"} onClick={openChat}>Open group chat</button>
            </div>
          </div>
        </Modal>
      )}
      {!booking && (leaving === "ask" || leaving === "busy") && (
        <Modal onClose={() => leaving === "ask" && setLeaving(null)} width={460}>
          <div style={{ padding: "26px 28px" }}>
            <div className="eyebrow" style={{ color: "#ff9fb3" }}>Leave group</div>
            <h2 style={{ marginTop: 8 }}>Step back from this trip?</h2>
            <p className="mu" style={{ marginTop: 10, lineHeight: 1.6, fontSize: 13.5 }}>
              You'll leave <b style={{ color: "#fff", fontWeight: 600 }}>{g.name}</b>. Your groupmates will get a friendly note, and your spot opens up for a new traveller.
              Changed your mind later? You can ask to join again while there's space.
            </p>
            <div className="row" style={{ marginTop: 22 }}>
              <button className="btn" style={{ flex: 1 }} disabled={leaving === "busy"} onClick={() => setLeaving(null)}>Stay in group</button>
              <button className="btn bleave solid" style={{ flex: 1 }} disabled={leaving === "busy"} onClick={leave}>{leaving === "busy" ? "Leaving…" : "Yes, leave group"}</button>
            </div>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal onClose={() => setConfirm(null)}>
          <div style={{ padding: "26px 28px" }}>
            <div className="eyebrow">Confirm group booking</div>
            <h2 style={{ marginTop: 8 }}>{splitName(confirm.hotel.hotel.name)}</h2>
            <div className="mu" style={{ marginTop: 4 }}>{confirm.opt.rooms_needed} × {confirm.opt.room_name} · {g.city} · {dLong(g.check_in)} → {dLong(g.check_out)} · {g.nights} nights</div>
            <div className="rule" style={{ marginTop: 16 }}>Price per room per night<span className="v">{inr(confirm.opt.price_per_night)}</span></div>
            <div className="rule">{inr(confirm.opt.price_per_night)} × {confirm.opt.rooms_needed} room{confirm.opt.rooms_needed > 1 ? "s" : ""} × {g.nights} nights<span className="v">{inr(confirm.opt.total_inr)}</span></div>
            <div className="rule">Each of {guests} pays<span className="v" style={{ color: "#8ff0c9" }}>≈ {inr(confirm.opt.per_member_inr)}</span></div>
            <div className="hint" style={{ marginTop: 12 }}>One booking for the whole group. Once confirmed it's locked and can't be edited.</div>
            <div className="row" style={{ marginTop: 20 }}><button className="btn" style={{ flex: 1 }} onClick={() => setConfirm(null)}>Not yet</button><button className="btn bp" style={{ flex: 1 }} onClick={book}>Confirm booking</button></div>
          </div>
        </Modal>
      )}
      {booked && <BookedModal b={booked.b} g={g} fresh={booked.fresh} onClose={() => setBooked(null)} />}
    </>
  );
}

function HotelCard({ r, i, n, g, saves, lowest, locked, onSave }: { r: HotelResult; i: number; n: number; g: GroupDetail; saves: Record<string, string[]>; lowest: number; locked: boolean; onSave: (room: string) => void }) {
  const { me } = useApp();
  const o = r.best;
  const who = o ? saves[o.room_id] ?? [] : [];
  const guests = g.members.length;
  const mine = who.includes(me!.id);
  const missing = g.members.filter((m) => !who.includes(m.id));
  const kind = hotelScenes[i % hotelScenes.length];
  const numColor = who.length === guests ? "#3ee6a8" : who.length ? "#ffc16b" : "rgba(255,255,255,.18)";
  if (!o) {
    return (
      <div className="gl rise" style={{ ["--i" as string]: i + 1, display: "grid", gridTemplateColumns: "210px 1fr 210px", gap: 20, padding: 14, marginTop: 12, opacity: 0.55, filter: "saturate(.4)" } as CSSProperties}>
        <Scene kind="lake" style={{ minHeight: 110 }} />
        <div style={{ paddingTop: 4 }}><h2>{splitName(r.hotel.name)}</h2><div className="mu" style={{ fontSize: 12.5, marginTop: 3 }}>{"★".repeat(r.hotel.stars)} · {r.hotel.area}</div><span className="pill pr" style={{ marginTop: 10 }}>{r.unavailable_reason}</span></div>
        <div className="divv" style={{ textAlign: "right" }}><div className="mu2" style={{ fontSize: 11 }}>Each pays</div><div className="price">—</div></div>
      </div>
    );
  }
  return (
    <div className={"gl rise" + (who.length === guests && guests > 1 ? " hi" : "")} style={{ ["--i" as string]: i + 1, display: "grid", gridTemplateColumns: "210px 1fr 210px", gap: 20, padding: 14, marginTop: i ? 12 : 0 } as CSSProperties}>
      <Scene kind={kind} style={{ minHeight: 170 }}>
        <div className="lab row" style={{ gap: 6 }}>
          <span className="glassbadge" style={{ background: numColor, color: who.length ? "#04140d" : "#fff", border: 0 }}>{n}</span>
          {o.min_rooms_left <= 3 && <span className="glassbadge warm">Only {o.min_rooms_left} room{o.min_rooms_left > 1 ? "s" : ""} left</span>}
        </div>
      </Scene>
      <div style={{ paddingTop: 4, minWidth: 0 }}>
        <h2>{splitName(r.hotel.name)}</h2>
        <div className="mu" style={{ fontSize: 12.5, marginTop: 3 }}>{"★".repeat(r.hotel.stars)} · {r.hotel.area} · guest rating {r.hotel.rating.toFixed(1)}</div>
        <div className="mu2" style={{ fontSize: 12, marginTop: 8 }}>
          {o.rooms_needed > 1 ? `${o.rooms_needed} × ` : ""}{o.room_name} · fits {o.max_adults} per room · free all {o.nights} nights · {inr(o.price_per_night)}/room/night{o.refundable ? " · refundable" : ""}
        </div>
        {r.options.filter((x) => x.available && x.room_id !== o.room_id).length > 0 && (
          <div className="mu2" style={{ fontSize: 11.5, marginTop: 4 }}>Also: {r.options.filter((x) => x.available && x.room_id !== o.room_id).map((x) => `${x.room_name} ${inr(x.per_member_inr)} pp`).join(" · ")}</div>
        )}
        <div className="row" style={{ marginTop: 14, flexWrap: "wrap" }}>
          {who.length > 0 && <div className="row" style={{ gap: 0 }}>{who.map((id, k) => { const m = g.members.find((x) => x.id === id); return m ? <Avatar key={id} id={id} name={m.name} size={24} style={{ marginLeft: k ? -10 : 0 }} /> : null; })}</div>}
          {who.length === 0 ? <span className="pill pn">Not saved yet</span>
            : who.length === guests ? <><span className="pill pg">{guests === 2 ? "Saved by both" : guests === 1 ? "Saved" : "Saved by everyone"}</span>{guests > 1 && <span className="pill pb">✓ Ready to lock</span>}</>
            : <><span className="pill pn">Saved by {who.length} of {guests}</span><span className="pill pa">Waiting on {missing.map((m) => m.name.split(" ")[0]).join(", ")}</span></>}
        </div>
      </div>
      <div className="divv" style={{ textAlign: "right" }}>
        <div className="mu2" style={{ fontSize: 11 }}>Total · {o.nights} nights</div><div className="num" style={{ fontWeight: 600 }}>{inr(o.total_inr)}</div>
        <div className="mu2" style={{ fontSize: 11, marginTop: 10 }}>Each pays</div><div className="price num" style={{ color: "#8ff0c9" }}>{inr(o.per_member_inr)}</div>
        <div className={"pill " + (o.per_member_inr <= lowest ? "pg" : "pa")} style={{ marginTop: 6 }}>{o.per_member_inr <= lowest ? "Fits every budget" : `Over ${inr(lowest)} budget`}</div>
        {!locked && <button className={"btn sm" + (mine ? "" : " bp")} style={{ marginTop: 10, width: "100%" }} onClick={() => onSave(o.room_id)}>{mine ? "★ Saved" : "☆ Save option"}</button>}
      </div>
    </div>
  );
}

function MapCard({ hotels, all, city, saves, guests }: { hotels: HotelResult[]; all: HotelResult[]; city: string; saves: Record<string, string[]>; guests: number }) {
  if (!all.length) return null;
  const lats = all.map((r) => r.hotel.lat), lngs = all.map((r) => r.hotel.lng);
  const [la0, la1, ln0, ln1] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const W = 300, H = 190, pad = 22;
  const x = (lng: number) => pad + ((lng - ln0) / (ln1 - ln0 || 1)) * (W - 2 * pad);
  const y = (lat: number) => H - pad - ((lat - la0) / (la1 - la0 || 1)) * (H - 2 * pad);
  const areas = new Map<string, { lat: number; lng: number; n: number }>();
  for (const r of all) { const a = areas.get(r.hotel.area) ?? { lat: 0, lng: 0, n: 0 }; a.lat += r.hotel.lat; a.lng += r.hotel.lng; a.n++; areas.set(r.hotel.area, a); }
  const color = (r: HotelResult) => { const n = r.best ? (saves[r.best.room_id] ?? []).length : 0; return n === guests ? "#3ee6a8" : n ? "#ffc16b" : "#6b7499"; };
  return (
    <div className="gl rise" style={{ ["--i" as string]: 3, marginTop: 12, padding: 16 } as CSSProperties}>
      <div className="row" style={{ justifyContent: "space-between" }}><h3>Where you'd stay · {city}</h3><span className="pill pn">drawn from hotel lat/lng · no map API</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20, marginTop: 12, alignItems: "center" }}>
        <div style={{ position: "relative", height: 228, borderRadius: 12, overflow: "hidden", background: "radial-gradient(circle at 30% 30%,#1a1f45,#0c0f24)" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <g stroke="rgba(255,255,255,.06)">{Array.from({ length: 13 }, (_, i) => <line key={"v" + i} x1={i * 25} y1="0" x2={i * 25} y2={H} />)}{Array.from({ length: 8 }, (_, i) => <line key={"h" + i} x1="0" y1={i * 25} x2={W} y2={i * 25} />)}</g>
            {[...areas].map(([name, a]) => <text key={name} x={x(a.lng / a.n)} y={y(a.lat / a.n) - 12} fill="#6b7499" fontSize="7.5" textAnchor="middle" style={{ textTransform: "uppercase", letterSpacing: 1 }}>{name.toUpperCase()}</text>)}
            {all.filter((r) => !hotels.includes(r)).map((r) => <circle key={r.hotel.hotel_id} cx={x(r.hotel.lng)} cy={y(r.hotel.lat)} r="3" fill={r.best ? "#6b7499" : "#3a3f55"} opacity=".7" />)}
            {hotels.map((r, i) => (
              <g key={r.hotel.hotel_id}>
                {i === 0 && <circle cx={x(r.hotel.lng)} cy={y(r.hotel.lat)} r="13" fill="rgba(62,230,168,.25)"><animate attributeName="r" values="9;16;9" dur="2s" repeatCount="indefinite" /></circle>}
                <circle cx={x(r.hotel.lng)} cy={y(r.hotel.lat)} r="8" fill={color(r)} />
                <text x={x(r.hotel.lng)} y={y(r.hotel.lat) + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill="#04140d">{i + 1}</text>
              </g>
            ))}
          </svg>
        </div>
        <div>
          {hotels.map((r, i) => (
            <div className="rule" style={{ padding: "10px 0" }} key={r.hotel.hotel_id}>
              <span className="tick" style={{ background: color(r), color: "#04140d" }}>{i + 1}</span>
              <div><b style={{ fontWeight: 600, color: "#fff" }}>{r.hotel.name}</b><div className="mu2" style={{ fontSize: 11.5 }}>{r.hotel.area} · {(saves[r.best!.room_id] ?? []).length}/{guests} saved</div></div>
              <span className="v">{inr(r.best!.per_member_inr)} pp</span>
            </div>
          ))}
          <div className="row mu2" style={{ fontSize: 11, marginTop: 8, gap: 12 }}><span><b style={{ color: "#3ee6a8" }}>●</b> everyone saved</span><span><b style={{ color: "#ffc16b" }}>●</b> some saved</span><span><b style={{ color: "#6b7499" }}>●</b> other stays</span></div>
        </div>
      </div>
    </div>
  );
}

function BookedBanner({ b, onOpen, onLeave }: { b: Booking; onOpen: () => void; onLeave?: () => void }) {
  return (
    <div className="gl hi rise" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16, borderColor: "rgba(62,230,168,.55)" }}>
      <span className="tick" style={{ width: 28, height: 28, fontSize: 13 }}>✓</span>
      <div style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>Booked: {b.hotel.name}</b><div className="mu" style={{ fontSize: 12.5 }}>{b.rooms} × {b.room.name} · {b.id} · total {inr(b.total_inr)} · locked</div></div>
      {onLeave && <button className="btn sm bleave" onClick={onLeave}>Leave group</button>}
      <button className="btn sm bp" onClick={onOpen}>View booking</button>
    </div>
  );
}

function BookedModal({ b, g, fresh, onClose }: { b: Booking; g: GroupDetail; fresh: boolean; onClose: () => void }) {
  function download() {
    const lines = [
      `Tripmate booking ${b.id}`, `${b.hotel.name} (${b.hotel.area}, ${g.city})`, `${b.rooms} x ${b.room.name}`,
      `${dLong(g.check_in)} -> ${dLong(g.check_out)} · ${b.nights.length} nights`, `Group total: ${inr(b.total_inr)}`, "",
      "Each person pays:", ...b.shares.map((s) => `  ${s.name}: ${paise(s.amount_paise)}`),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    a.download = `${b.id}.txt`; a.click();
  }
  return (
    <>
      {fresh && <Confetti />}
      <Modal onClose={onClose}>
        <Scene kind={heroScene(g.city)} style={{ height: 150, borderRadius: 0 }}>
          <div className="bl"><div className="row"><span className="glassbadge" style={{ color: "#8ff0c9", borderColor: "rgba(62,230,168,.5)" }}>✓ Booking confirmed</span><span className="glassbadge">🔒 Locked</span></div></div>
        </Scene>
        <div style={{ padding: "24px 28px 26px" }}>
          <h1 style={{ fontSize: 30 }}>{splitName(b.hotel.name)}</h1>
          <div className="mu" style={{ marginTop: 4 }}>{b.rooms > 1 ? `${b.rooms} × ` : ""}{b.room.name} · {g.city} · {dLong(g.check_in).replace(" 2027", "")} → {dLong(g.check_out)} · {b.nights.length} nights</div>
          <div className="row" style={{ marginTop: 16, justifyContent: "space-between", padding: "10px 14px", borderRadius: 4, background: "rgba(255,255,255,.05)", border: "1px solid var(--line)" }}>
            <span className="mu2">Booking ID</span><b style={{ fontFamily: "ui-monospace,Consolas,monospace", letterSpacing: 1.5, fontSize: 13 }}>{b.id}</b>
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}><span className="mu">Group total · {b.nights.length} nights</span><span className="price num" style={{ fontSize: 30 }}><CountUp value={b.total_inr} format={inr} /></span></div>
          <div className="eyebrow" style={{ marginTop: 18 }}>Each person pays</div>
          {b.shares.map((s, i) => (
            <div className="row" style={{ justifyContent: "space-between", marginTop: i ? 8 : 10 }} key={s.traveller_id}>
              <div className="row"><Avatar id={s.traveller_id} name={s.name} size={26} />{firstName(s.name)}
                {!g.members.some((m) => m.id === s.traveller_id) && <span className="pill pr" title="Left the group after booking. Their share is still on the booking.">left the group</span>}</div>
              <b className="num" style={{ fontWeight: 600 }}><CountUp value={s.amount_paise} format={(v) => paise(Math.round(v))} /></b>
            </div>
          ))}
          <div className="hint" style={{ marginTop: 12 }}>Shares are in paise and always add up to the total; any leftover paisa goes to the first members.</div>
          <div className="row" style={{ marginTop: 20 }}><button className="btn" style={{ flex: 1 }} onClick={download}>Download summary</button><button className="btn bp" style={{ flex: 1 }} onClick={onClose}>Back to group</button></div>
        </div>
      </Modal>
    </>
  );
}

function Chat({ groupId, meId, members }: { groupId: string; meId: string; members: { id: string; name: string }[] }) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(() => api<Message[]>(`/groups/${groupId}/messages`).then(setMsgs).catch(() => {}), [groupId]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 4000); return () => clearInterval(t); }, [load]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs.length]);
  async function send() {
    if (!text.trim()) return;
    const body = text; setText("");
    await api(`/groups/${groupId}/messages`, { body: { body } }).catch(() => setText(body));
    void load();
  }
  return (
    <div className="gl rise" style={{ ["--i" as string]: 2, marginTop: 16 } as CSSProperties}>
      <h3>Group chat</h3>
      <div ref={box} style={{ marginTop: 12, fontSize: 12.5, maxHeight: 300, overflow: "auto" }}>
        {msgs.length === 0 && <div className="mu2">No messages yet. Say hi and talk through the stays.</div>}
        {msgs.map((m) => m.traveller_id === meId ? (
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }} key={m.id}><div style={{ background: "#f4f2ee", color: "#0b0d11", fontWeight: 500, padding: "8px 12px", borderRadius: "12px 12px 4px 12px", maxWidth: "80%" }}>{m.body}</div></div>
        ) : (
          <div className="row" style={{ alignItems: "flex-start", marginTop: 8 }} key={m.id}>
            <Avatar id={m.traveller_id} name={members.find((x) => x.id === m.traveller_id)?.name ?? m.name} size={24} />
            <div style={{ background: "rgba(255,255,255,.07)", padding: "8px 12px", borderRadius: "12px 12px 12px 4px", maxWidth: "80%" }}>{m.body}</div>
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }}><input id="group-chat-input" className="in" style={{ marginTop: 10 }} placeholder="Message the group…" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} /></form>
    </div>
  );
}
