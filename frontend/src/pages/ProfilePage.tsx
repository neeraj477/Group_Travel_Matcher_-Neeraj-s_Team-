// G2 · Group member profile: interests, home city, age and the groups they're in.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, range, type GroupSummary, type Profile } from "../api";
import { Avatar, Loading, useApp, useInterestLabel } from "../ui";

export default function ProfilePage() {
  const { id } = useParams();
  const { me } = useApp();
  const label = useInterestLabel();
  const [p, setP] = useState<(Profile & { home_airport: string; groups: GroupSummary[] }) | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<typeof p>(`/travellers/${id}`).then(setP).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <div className="wrap"><div className="gl empty"><h2>{err}</h2></div></div>;
  if (!p) return <Loading />;
  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div className="gl hi rise" style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <Avatar id={p.id} name={p.name} size={80} />
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Traveller profile{me?.id === p.id ? " · you" : ""}</div>
          <h1 style={{ marginTop: 6, fontSize: 30 }}>{p.name}{p.age ? <>, <em>{p.age}</em></> : null}</h1>
          <div className="mu2" style={{ marginTop: 2 }}>@{p.username}</div>
          <div className="mu" style={{ marginTop: 4 }}>{p.home_city} · {p.home_airport} · {p.gender === "FEMALE" ? "woman" : "man"} · travels with {p.gender_preference === "SAME_GENDER" ? (p.gender === "FEMALE" ? "women only" : "men only") : "anyone"}</div>
          <div className="chips" style={{ marginTop: 14 }}>{p.interests.map((i) => <span className="chip on" key={i}>{label(i)}</span>)}</div>
        </div>
      </div>
      <div className="gl rise" style={{ marginTop: 16 }}>
        <h3>Groups {p.groups.length ? `(${p.groups.length})` : ""}</h3>
        {p.groups.length === 0 && <div className="mu" style={{ marginTop: 10 }}>Not in any group yet.</div>}
        {p.groups.map((g) => (
          <Link to={`/groups/${g.id}`} className="rule" key={g.id}>
            {g.owner.id === p.id ? <span className="pill pb">Owner</span> : <span className="pill pn">Member</span>}
            <b style={{ fontWeight: 600 }}>{g.name}</b><span className="mu2">{g.city} · {range(g.check_in, g.check_out)}</span>
            <span className="v">{g.members.length} / {g.max_size}{g.booked ? " · 🔒 booked" : ""}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
