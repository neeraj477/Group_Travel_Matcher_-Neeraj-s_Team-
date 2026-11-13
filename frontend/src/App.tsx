import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ago, api, session, type Me, type Meta, type Notification } from "./api";
import { Avatar, Ctx, Loading, useApp } from "./ui";
import SignUp from "./pages/SignUp";
import CreateGroup from "./pages/CreateGroup";
import FindGroups from "./pages/FindGroups";
import Requests from "./pages/Requests";
import GroupPage from "./pages/GroupPage";
import MyGroups from "./pages/MyGroups";
import ProfilePage from "./pages/ProfilePage";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ready, setReady] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; bad?: boolean } | null>(null);

  const refreshMe = useCallback(async () => {
    if (!session.get()) { setMe(null); return; }
    try { setMe(await api<Me>("/me")); } catch (e: any) { if (e.status === 401) { session.clear(); setMe(null); } }
  }, []);
  const setUser = useCallback(async (id: string | null) => {
    if (id) session.set(id); else session.clear();
    try { sessionStorage.removeItem("tripmate.lastSearch"); } catch { /* ignore */ }
    setMe(null);
    await refreshMe();
  }, [refreshMe]);
  const toast = useCallback((msg: string, bad?: boolean) => { setToastMsg({ msg, bad }); setTimeout(() => setToastMsg(null), 3200); }, []);

  useEffect(() => {
    Promise.all([api<Meta>("/meta").then(setMeta), refreshMe()]).catch((e) => toast(e.message, true)).finally(() => setReady(true));
  }, [refreshMe, toast]);
  // keep the notification badge fresh
  useEffect(() => { const t = setInterval(() => void refreshMe(), 8000); return () => clearInterval(t); }, [refreshMe]);

  return (
    <Ctx.Provider value={{ me, meta, refreshMe, setUser, toast }}>
      <svg width="0" height="0" style={{ position: "absolute" }}><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stopColor="#f0c48a" /><stop offset="1" stopColor="#ffffff" /></linearGradient></defs></svg>
      <div className="app">
        <div className="aur"><i /><i /><i /></div><div className="grain" />
        {!ready ? <Loading /> : (
          <Routes>
            <Route path="/welcome" element={<SignUp />} />
            <Route path="/" element={<Navigate to={me ? "/find" : "/welcome"} replace />} />
            <Route path="/create" element={<Shell><CreateGroup /></Shell>} />
            <Route path="/find" element={<Shell><FindGroups /></Shell>} />
            <Route path="/my" element={<Shell><MyGroups /></Shell>} />
            <Route path="/groups/:id" element={<Shell open><GroupPage /></Shell>} />
            <Route path="/groups/:id/requests" element={<Shell><Requests /></Shell>} />
            <Route path="/travellers/:id" element={<Shell open><ProfilePage /></Shell>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
        {toastMsg && <div className={"toast" + (toastMsg.bad ? " bad" : "")}>{toastMsg.msg}</div>}
      </div>
    </Ctx.Provider>
  );
}

/** 🔔 Badge = join requests waiting + unread notes. Opening the panel marks the notes read. */
function Bell({ me }: { me: Me }) {
  const { refreshMe } = useApp();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const count = me.pending_requests + me.unread_notifications;
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    try {
      setItems(await api<Notification[]>("/notifications"));
      if (me.unread_notifications > 0) { await api("/notifications/read", { body: {} }); void refreshMe(); }
    } catch { setItems([]); }
  }
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="bell" title="Notifications" aria-label={`Notifications, ${count} new`} onClick={toggle}>🔔{count > 0 && <b>{count}</b>}</button>
      {open && (
        <div className="gl notif">
          <div className="notif-head"><b>Notifications</b></div>
          {me.pending_requests > 0 && (
            <Link to="/my" className="notif-item notif-req">
              <span className="notif-ic">✋</span>
              <div><div>{me.pending_requests} join request{me.pending_requests > 1 ? "s" : ""} waiting for your answer</div><div className="mu2 notif-t">Review them from My groups →</div></div>
            </Link>
          )}
          {items === null ? <div className="mu2 notif-empty">Loading…</div>
            : items.length === 0 && me.pending_requests === 0 ? <div className="mu2 notif-empty">You're all caught up ✨</div>
            : items.map((n) => (
              <Link key={n.id} to={n.group ? `/groups/${n.group.id}` : "/my"} className={"notif-item" + (n.read ? "" : " unread")}>
                <span className="notif-ic">👋</span>
                <div><div>{n.body}</div><div className="mu2 notif-t">{ago(n.created_at)}</div></div>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}

/** Page frame with the top nav. Pages need a profile unless `open`. */
function Shell({ children, open }: { children: ReactNode; open?: boolean }) {
  const { me, setUser } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [loc.pathname]);
  if (!me && !open) return <Navigate to="/welcome" replace />;
  return (
    <>
      <div className="nav">
        <NavLink to="/" className="logo"><div className="mark" /><span>Trip<em>mate</em></span></NavLink>
        <NavLink to="/create" className={({ isActive }) => "nl" + (isActive ? " on" : "")}>Create group</NavLink>
        <NavLink to="/find" className={({ isActive }) => "nl" + (isActive ? " on" : "")}>Find groups</NavLink>
        <NavLink to="/my" className={({ isActive }) => "nl" + (isActive || /^\/groups\//.test(loc.pathname) ? " on" : "")}>My groups</NavLink>
        <div className="sp" />
        {me ? (
          <>
            <Bell me={me} />
            <div style={{ position: "relative" }}>
              <button onClick={() => setMenu(!menu)} style={{ background: "none", border: 0, cursor: "pointer" }}><Avatar id={me.id} name={me.name} /></button>
              {menu && (
                <div className="gl menu">
                  <div style={{ padding: "6px 10px 10px" }}><b style={{ fontWeight: 600 }}>{me.name}</b><div className="mu2" style={{ fontSize: 11.5 }}>{me.id} · {me.home_city}</div></div>
                  <button onClick={() => nav(`/travellers/${me.id}`)}>My profile</button>
                  <button onClick={() => { setUser(null); nav("/welcome?pick=1"); }}>Switch profile</button>
                  <button onClick={() => { setUser(null); nav("/welcome"); }}>Sign out</button>
                </div>
              )}
            </div>
          </>
        ) : <NavLink to="/welcome" className="nl">Sign up</NavLink>}
      </div>
      {children}
    </>
  );
}
