import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ago, api, firstName, inr, range, type GroupSummary } from "../api";
import { cityScene } from "../scenes";
import { Avatar, Loading, Scene, useApp } from "../ui";
import { splitName } from "./CreateGroup";

interface Resp { groups: (GroupSummary & { pending_count: number })[]; requests: { id: number; status: string; created_at: string; group: GroupSummary }[] }

export default function MyGroups() {
  const { me } = useApp();
  const [d, setD] = useState<Resp | null>(null);
  useEffect(() => { api<Resp>("/me/groups").then(setD).catch(() => {}); }, [me?.pending_requests]);
  if (!d) return <Loading />;
  return (
    <div className="wrap">
      <div className="eyebrow">Signed in as {me?.name}</div>
      <h1 style={{ marginTop: 6 }}>My <em>groups</em></h1>
      {d.groups.length === 0 && (
        <div className="gl empty" style={{ marginTop: 20 }}>
          <h2>You're not in a group <em>yet</em></h2>
          <p className="sub">Find a group that fits you, or post your own trip.</p>
          <div className="row" style={{ justifyContent: "center", marginTop: 18 }}><Link className="btn bp" to="/find">Find groups</Link><Link className="btn" to="/create">Create group</Link></div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(400px,1fr))", gap: 16, marginTop: 20 }}>
        {d.groups.map((g, i) => (
          <div key={g.id} className={"gl rise" + (g.pending_count ? " hi" : "")} style={{ ["--i" as string]: i, padding: 0, overflow: "hidden" } as CSSProperties}>
            <Link to={`/groups/${g.id}`}>
              <Scene kind={cityScene[g.city] ?? "sunset"} style={{ height: 150, borderRadius: 0 }}>
                <div className="lab row" style={{ gap: 6 }}>
                  {g.is_owner && <span className="glassbadge">Owner</span>}
                  {g.booked ? <span className="glassbadge" style={{ color: "#8ff0c9" }}>🔒 Booked</span> : <span className="glassbadge">{g.members.length} / {g.max_size} members</span>}
                </div>
                <div className="bl"><h2>{splitName(g.name)}</h2><div className="mu" style={{ fontSize: 12 }}>{g.city} · {range(g.check_in, g.check_out)} 2027 · {g.nights} nights</div></div>
              </Scene>
            </Link>
            <div style={{ padding: "14px 18px" }} className="row">
              {g.members.map((p, k) => <Avatar key={p.id} id={p.id} name={p.name} size={26} style={{ marginLeft: k ? -10 : 0 }} />)}
              <span className="mu2" style={{ fontSize: 12 }}>~{inr(g.budget_inr)} pp</span>
              <span className="sp" />
              {g.pending_count > 0 && <Link to={`/groups/${g.id}/requests`} className="btn sm bp">🔔 {g.pending_count} request{g.pending_count > 1 ? "s" : ""}</Link>}
              <Link to={`/groups/${g.id}`} className="btn sm">Open</Link>
            </div>
          </div>
        ))}
      </div>
      {d.requests.length > 0 && (
        <div className="gl rise" style={{ marginTop: 26 }}>
          <h3>My join requests</h3>
          {d.requests.map((r) => (
            <div className="rule" key={r.id}>
              <span className={"pill " + (r.status === "PENDING" ? "pa" : "pr")}>{r.status === "PENDING" ? "Waiting" : r.status === "REJECTED" ? "Declined" : "Closed"}</span>
              <Link to={`/groups/${r.group.id}`} style={{ fontWeight: 600 }}>{r.group.name}</Link>
              <span className="mu2">{r.group.city} · {range(r.group.check_in, r.group.check_out)} · owner {firstName(r.group.owner.name)}</span>
              <span className="v mu2" style={{ fontWeight: 400 }}>{ago(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
