// Screen 01 · Sign up (M1). Name-only identity plus a unique username, saved server-side.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type Gender, type GenderPref, type Profile } from "../api";
import { Avatar, Field, InterestChips, Modal, Scene, Seg, useApp, useInterestLabel } from "../ui";

export default function SignUp() {
  const { meta, setUser, toast, me } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const check = useUsernameCheck(username);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender>("FEMALE");
  const [home, setHome] = useState("");
  const [pref, setPref] = useState<GenderPref>("SAME_GENDER");
  const [interests, setInterests] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(params.get("pick") === "1");

  const sameLabel = gender === "FEMALE" ? "Women only" : "Men only";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Enter your name.";
    if (!/^[a-z0-9_]{3,20}$/.test(username)) errs.username = "Use 3–20 characters: lowercase letters, numbers or _.";
    else if (check.state === "taken") errs.username = check.reason ?? "That username is already taken.";
    if (!/^\d+$/.test(age) || +age < 18 || +age > 100) errs.age = "Age 18–100.";
    if (!home) errs.home_city = "Pick your home city.";
    if (interests.length < 2) errs.interests = "Pick at least 2 interests — matching needs 2 shared ones.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const p = await api<Profile>("/travellers", { body: { username, name, age: +age, gender, home_city: home, gender_preference: pref, interests } });
      await setUser(p.id);
      toast(`Welcome, ${p.name.split(" ")[0]}! Your profile is saved.`);
      nav("/find");
    } catch (err) {
      if (err instanceof ApiError && err.field) setErrors({ [err.field]: err.message });
      else toast((err as Error).message, true);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <div className="nav" style={{ position: "relative" }}>
        <Link to="/" className="logo"><div className="mark" /><span>Trip<em>mate</em></span></Link>
        <div className="sp" />
        {me && <Link to="/find" className="nl" style={{ marginRight: 12 }}>Continue as {me.name.split(" ")[0]} →</Link>}
        <button className="linkish nl" style={{ color: "var(--mu)", fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase" }} onClick={() => setPicking(true)}>Already joined? Pick your profile</button>
      </div>
      <Scene kind="fjord" style={{ position: "absolute", inset: "66px 0 0 0", borderRadius: 0, zIndex: -1 }}>
        <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "linear-gradient(90deg,rgba(8,9,12,.72) 0%,rgba(8,9,12,.25) 45%,rgba(8,9,12,.05) 60%,rgba(8,9,12,.55) 100%)" }} />
      </Scene>
      <div className="wrap" style={{ display: "grid", gridTemplateColumns: "1fr 520px", gap: 40, alignItems: "center", minHeight: "calc(100vh - 66px)" }}>
        <div className="rise" style={{ paddingBottom: 120 }}>
          <div className="hero-tag">Travel solo. Not alone.</div>
          <div style={{ width: 56, height: 1, background: "#f0c48a", margin: "22px 0" }} />
          <div style={{ fontSize: 17, fontWeight: 300, color: "#e9e6e0", maxWidth: 470, lineHeight: 1.6, textShadow: "0 2px 16px rgba(0,0,0,.6)" }}>
            Find people heading to the same city, on the same nights, who love the same things — then book one stay together and split it fairly.
          </div>
          <div className="row" style={{ marginTop: 28, gap: 26 }}>
            {[[meta?.stats.cities ?? 5, "Cities"], [meta?.stats.open_groups ?? 0, "Open groups"], [meta?.stats.rules ?? 6, "Match rules"]].map(([n, l]) => (
              <div key={l}><div style={{ fontSize: 26, fontWeight: 300 }}>{n}</div><div style={{ fontSize: 10, letterSpacing: ".24em", textTransform: "uppercase", color: "#d9d3c8" }}>{l}</div></div>
            ))}
          </div>
        </div>
        <form className="gl rise" style={{ padding: 34 }} onSubmit={submit} noValidate>
          <div className="row" style={{ gap: 6, marginBottom: 22 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--g)" }} /><div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--line)" }} /><div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--line)" }} />
          </div>
          <div className="eyebrow">Step 1 of 3 · Your profile</div>
          <h1 style={{ marginTop: 10, fontSize: 28 }}>Your profile</h1>
          <p className="sub">Tell us a little about you. We only show groups that genuinely fit.</p>
          <div className="grid2" style={{ marginTop: 26 }}>
            <Field label="Full name" error={errors.name}><input className={"in" + (errors.name ? " e" : "")} value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" autoFocus /></Field>
            <Field label="Age" error={errors.age}><input className={"in" + (errors.age ? " e" : "")} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} placeholder="26" inputMode="numeric" /></Field>
            <Field label="Username" style={{ gridColumn: "1 / -1" }} error={errors.username ?? (check.state === "taken" ? check.reason ?? undefined : undefined)}
            hint={check.state === "checking" ? "Checking…" : check.state === "ok" ? <span style={{ color: "#8fd19e" }}>@{username} is available</span> : "Unique to you. Lowercase letters, numbers and _."}>
            <div style={{ position: "relative" }}>
              <span className="mu2" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>@</span>
              <input className={"in" + (errors.username || check.state === "taken" ? " e" : "")} style={{ paddingLeft: 30 }} value={username} placeholder="priya_travels" autoComplete="off" spellCheck={false} maxLength={20}
                onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); setErrors(({ username: _, ...rest }) => rest); }} />
            </div>
          </Field>
          <Field label="Gender"><Seg value={gender} onChange={setGender} options={[{ value: "FEMALE", label: "Female" }, { value: "MALE", label: "Male" }]} /></Field>
            <Field label="Home city" error={errors.home_city}>
              <select className={"in" + (errors.home_city ? " e" : "")} value={home} onChange={(e) => setHome(e.target.value)}>
                <option value="">Select…</option>
                {meta?.departure_cities.map((d) => <option key={d.airport} value={d.city}>{d.city} · {d.airport}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Travel with" style={{ marginTop: 18 }} hint="Checked both ways — you only see groups whose owner also accepts you.">
            <Seg value={pref} onChange={setPref} options={[{ value: "SAME_GENDER", label: sameLabel }, { value: "ANY", label: "Anyone" }]} />
          </Field>
          <Field label="Interests · pick 2+" style={{ marginTop: 18 }} error={errors.interests} hint={<>Loaded from <code>GET /api/meta</code></>}>
            <InterestChips value={interests} onChange={setInterests} interests={meta?.interests ?? []} highlight />
          </Field>
          <button className="btn bp" style={{ width: "100%", marginTop: 26, height: 44 }} disabled={busy}>{busy ? "Saving…" : "Create my profile →"}</button>
        </form>
      </div>
      {picking && <PickProfile onClose={() => setPicking(false)} />}
    </div>
  );
}

type UsernameCheck = { state: "idle" | "checking" | "ok" | "taken"; reason: string | null };
/** Asks the backend whether a username is free, 350 ms after the user stops typing. */
function useUsernameCheck(username: string): UsernameCheck {
  const [check, setCheck] = useState<UsernameCheck>({ state: "idle", reason: null });
  useEffect(() => {
    if (username.length < 3) { setCheck({ state: "idle", reason: null }); return; }
    setCheck({ state: "checking", reason: null });
    let live = true;
    const timer = setTimeout(() => {
      api<{ available: boolean; reason: string | null }>(`/usernames/${encodeURIComponent(username)}`)
        .then((r) => { if (live) setCheck({ state: r.available ? "ok" : "taken", reason: r.reason }); })
        .catch(() => { if (live) setCheck({ state: "idle", reason: null }); });
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [username]);
  return check;
}

function PickProfile({ onClose }: { onClose: () => void }) {
  const { setUser } = useApp();
  const label = useInterestLabel();
  const nav = useNavigate();
  const [list, setList] = useState<Profile[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => { api<Profile[]>("/travellers").then(setList).catch(() => {}); }, []);
  const shown = useMemo(() => list.filter((t) => (t.name + t.username + t.id + t.home_city).toLowerCase().includes(q.toLowerCase())), [list, q]);
  return (
    <Modal onClose={onClose} width={560}>
      <div style={{ padding: "24px 26px" }}>
        <div className="eyebrow">Already joined</div>
        <h2 style={{ marginTop: 6 }}>Pick your <em>profile</em></h2>
        <input className="in" style={{ marginTop: 16 }} placeholder="Search by name, username, id or city…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div style={{ marginTop: 12, maxHeight: 420, overflow: "auto" }}>
          {shown.map((t) => (
            <button key={t.id} className="pick" onClick={async () => { await setUser(t.id); nav("/find"); }}>
              <Avatar id={t.id} name={t.name} size={34} />
              <div style={{ flex: 1 }}>
                <b style={{ fontWeight: 600 }}>{t.name}</b> <span className="mu2" style={{ fontSize: 11.5 }}>@{t.username} · {t.id} · {t.age} · {t.home_city} · {t.gender === "FEMALE" ? "woman" : "man"}{t.gender_preference === "SAME_GENDER" ? (t.gender === "FEMALE" ? " · women only" : " · men only") : ""}</span>
                <div className="mu" style={{ fontSize: 11.5, marginTop: 2 }}>{t.interests.map(label).join(" · ")}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
