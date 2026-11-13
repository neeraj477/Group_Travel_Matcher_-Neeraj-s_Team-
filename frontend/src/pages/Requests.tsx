// Screen 04 · Accept or decline (M5). The owner sees the same 6-rule check; state persists.
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { ago, api, firstName, inr, range, type GroupSummary, type JoinRequest } from "../api";
import { cityScene } from "../scenes";
import { Avatar, Loading, Rules, Scene, useApp, useInterestLabel } from "../ui";
import { splitName } from "./CreateGroup";

interface Resp { group: GroupSummary; pending: JoinRequest[]; recent: JoinRequest[] }

export default function Requests() {
  const { id } = useParams();
  const { toast, refreshMe } = useApp();
  const label = useInterestLabel();
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState("");
  const [leaving, setLeaving] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => api<Resp>(`/groups/${id}/requests`).then(setData).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { void load(); }, [load]);

  async function decide(r: JoinRequest, approve: boolean) {
    setLeaving(r.id);
    try {
      await api(`/requests/${r.id}/${approve ? "approve" : "reject"}`, { method: "POST" });
      toast(approve ? `${firstName(r.seeker.name)} joined the group.` : `Declined ${firstName(r.seeker.name)}.`);
      setTimeout(() => { void load(); void refreshMe(); setLeaving(null); }, 350);
    } catch (e) { toast((e as Error).message, true); setLeaving(null); void load(); }
  }

  if (err) return <div className="wrap"><div className="gl empty"><h2>{err}</h2><Link to="/my" className="btn" style={{ marginTop: 16 }}>Back to my groups</Link></div></div>;
  if (!data) return <Loading />;
  const g = data.group;
  const filled = g.members.length;
  return (
    <>
      <Scene kind={g.city === "Kyoto" ? "pagoda" : cityScene[g.city]} style={{ height: 220, borderRadius: 0 }}>
        <div className="bl" style={{ left: 40, right: 40, bottom: 22 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <div><div className="eyebrow">Your group · {g.city} · {range(g.check_in, g.check_out)} 2027</div><h1 style={{ marginTop: 6 }}>{splitName(g.name)}</h1></div>
            <div className="row">
              <span className="glassbadge">{filled} of {g.max_size} places filled</span>
              {data.pending.length > 0 && <span className="glassbadge" style={{ color: "var(--badt)", borderColor: "var(--badline)" }}>● {data.pending.length} waiting for you</span>}
              <Link to={`/groups/${g.id}`} className="btn sm">Group page →</Link>
            </div>
          </div>
        </div>
      </Scene>
      <div className="wrap" style={{ display: "grid", gridTemplateColumns: "1fr 330px", gap: 26 }}>
        <div>
          {data.pending.length === 0 && (
            <div className="gl empty rise">
              <h2>No requests <em>waiting</em></h2>
              <p className="sub">{g.open_places === 0 ? "Your group is full." : g.booked ? "Your group has booked, so it's closed." : "When a seeker who fits all 6 rules taps “I'm interested”, they'll show up here."}</p>
            </div>
          )}
          {data.pending.map((r, i) => (
            <div key={r.id} className={"gl rise" + (i === 0 ? " hi" : "")} style={{ ["--i" as string]: i + 1, marginTop: i ? 14 : 0, transition: "transform .35s, opacity .35s", ...(leaving === r.id ? { transform: "translateX(120px)", opacity: 0 } : {}) } as CSSProperties}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 20, alignItems: "center" }}>
                <Link to={`/travellers/${r.seeker.id}`}><Avatar id={r.seeker.id} name={r.seeker.name} size={54} /></Link>
                <div>
                  <div className="row"><h2>{r.seeker.name}, <em>{r.seeker.age}</em></h2>{r.score !== null && <span className="pill pg">Fit {r.score}</span>}{r.rules.some((x) => !x.pass) && <span className="pill pr">No longer fits</span>}</div>
                  <div className="mu" style={{ fontSize: 12.5, marginTop: 2 }}>{r.seeker.home_city} · {r.seeker.gender === "FEMALE" ? "woman" : "man"} · {r.search.gender_preference === "SAME_GENDER" ? (r.seeker.gender === "FEMALE" ? "women only" : "men only") : "anyone"} · asked {ago(r.created_at)}</div>
                  <div className="chips" style={{ marginTop: 10 }}>
                    {r.search.interests.map((x) => <span key={x} className={"chip" + (r.shared_interests.includes(x) ? " sh" : "")}>{r.shared_interests.includes(x) ? "✓ " : ""}{label(x)}</span>)}
                  </div>
                  <div className="mu2" style={{ fontSize: 12, marginTop: 9 }}>
                    {r.shared_nights} shared nights ({range(r.search.check_in, r.search.check_out)}) · {inr(r.search.budget_inr)} ({r.rules.find((x) => x.key === "budget")?.value} gap) · {r.rules.find((x) => x.key === "size")?.pass ? "fits group size" : "group is full"}
                    {" · "}<button className="linkish" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "hide" : "see"} the 6-rule check</button>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button className="btn bok sm" style={{ width: 120 }} disabled={leaving !== null || r.rules.some((x) => !x.pass)} onClick={() => decide(r, true)}>✓ Approve</button>
                  <button className="btn bno sm" disabled={leaving !== null} onClick={() => decide(r, false)}>Decline</button>
                </div>
              </div>
              {open === r.id && <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--line)", maxWidth: 520 }}><Rules rules={r.rules} /></div>}
            </div>
          ))}
          {data.pending.length > 0 && g.open_places > 0 && data.pending.length >= g.open_places && (
            <div className="gl rise" style={{ ["--i" as string]: 3, marginTop: 14, padding: "14px 18px", borderStyle: "dashed" } as CSSProperties}>
              <div className="row"><span className="pill pa">Heads-up</span><span className="mu" style={{ fontSize: 12.5 }}>
                Approving {g.open_places === 1 ? "one more person" : `${g.open_places} more`} fills the group ({g.max_size} / {g.max_size}). Remaining requests close and the post leaves search.</span></div>
            </div>
          )}
        </div>
        <div className="gl rise" style={{ ["--i" as string]: 2, alignSelf: "start" } as CSSProperties}>
          <h3>Members</h3>
          {g.members.map((p) => (
            <Link to={`/travellers/${p.id}`} className="row" style={{ marginTop: 14 }} key={p.id}>
              <Avatar id={p.id} name={p.name} />
              <div><b style={{ fontWeight: 600 }}>{firstName(p.name)}</b> {p.id === g.owner.id && <span className="pill pb" style={{ marginLeft: 4 }}>Owner</span>}<div className="mu2" style={{ fontSize: 11.5 }}>{p.home_city} · {p.age}</div></div>
            </Link>
          ))}
          {g.open_places > 0 && <div className="row" style={{ marginTop: 12 }}><div className="av ghost" style={{ color: "var(--mu2)", borderColor: "var(--mu2)" }}>+</div><span className="mu2">{g.open_places} place{g.open_places > 1 ? "s" : ""} open</span></div>}
          {data.recent.length > 0 && (
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 14 }}>
              <h3>Recent</h3>
              {data.recent.map((r) => (
                <div className="rule" key={r.id}>
                  <span className={"tick" + (r.status === "APPROVED" ? "" : " x")}>{r.status === "APPROVED" ? "✓" : "✕"}</span>
                  {firstName(r.seeker.name)} {r.status === "APPROVED" ? "approved" : r.status === "REJECTED" ? "declined" : "closed (group full)"}
                  <span className="v mu2" style={{ fontWeight: 400 }}>{r.decided_at ? ago(r.decided_at) : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
