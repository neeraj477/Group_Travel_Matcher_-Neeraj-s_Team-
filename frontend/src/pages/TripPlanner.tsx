// Group planning (S2), shown on the Common Group Page once the stay is booked.
// Left: a day-by-day plan for every day of the trip. Right: a shared to-do list with an owner per item.
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { api, ApiError, dShort, firstName, type GroupDetail, type PlanItem, type PlanResponse } from "../api";
import { Avatar, useApp } from "../ui";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dow = (d: string) => DOW[new Date(d + "T00:00:00Z").getUTCDay()];

export default function TripPlanner({ g }: { g: GroupDetail }) {
  const { toast } = useApp();
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const load = useCallback(() => api<PlanResponse>(`/groups/${g.id}/plan`).then(setPlan).catch(() => {}), [g.id]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 6000); return () => clearInterval(t); }, [load]); // see others' edits

  const days = plan?.days ?? [];
  const current = day && days.includes(day) ? day : days[0];
  const perDay = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    for (const a of plan?.activities ?? []) m.set(a.day!, [...(m.get(a.day!) ?? []), a]);
    return m;
  }, [plan]);

  /** Runs a change, then reloads so every member's view stays the same as the server's. */
  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await load(); } catch (e) { toast((e as Error).message, true); throw e; }
  }
  const add = (body: Record<string, unknown>) => act(() => api(`/groups/${g.id}/plan`, { body }));
  const toggle = (id: number) => act(() => api(`/groups/${g.id}/plan/${id}/toggle`, { body: {} }));
  const remove = (id: number) => act(() => api(`/groups/${g.id}/plan/${id}`, { method: "DELETE" }));

  const todos = plan?.todos ?? [];
  const doneCount = todos.filter((t) => t.done).length;

  return (
    <div className="gl rise" style={{ ["--i" as string]: 2, marginTop: 16 } as CSSProperties}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2>Group <em>planning</em></h2>
          <div className="mu2" style={{ fontSize: 12, marginTop: 2 }}>Everyone in the group can add, tick and remove items. Changes show up for all members.</div>
        </div>
        <span className="pill pn">{plan ? `${plan.activities.length} activities · ${doneCount}/${todos.length} to-dos done` : "Loading…"}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 22, marginTop: 18 }}>
        {/* ---------- day by day ---------- */}
        <div>
          <div className="eyebrow" style={{ fontSize: 9.5 }}>Day by day</div>
          {/* One scrollable row, so a long trip doesn't push the plan down. */}
          <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4 }}>
            {days.map((d, i) => {
              const n = perDay.get(d)?.length ?? 0;
              return (
                <button key={d} type="button" className={"chip" + (d === current ? " on" : "")} onClick={() => setDay(d)} style={{ height: "auto", padding: "6px 10px", flexDirection: "column", alignItems: "flex-start", gap: 1, flex: "none" }}>
                  <span style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--mu2)" }}>Day {i + 1}{i === 0 ? " · arrive" : i === days.length - 1 ? " · depart" : ""}</span>
                  <span>{dow(d)} {dShort(d)}{n ? <b style={{ marginLeft: 6, color: "var(--amb)" }}>{n}</b> : null}</span>
                </button>
              );
            })}
          </div>
          {current && (
            <div style={{ marginTop: 14 }}>
              {(perDay.get(current) ?? []).length === 0 && <div className="mu2" style={{ fontSize: 12.5, padding: "14px 0" }}>Nothing planned for {dow(current)} {dShort(current)} yet.</div>}
              {(perDay.get(current) ?? []).map((a) => (
                <div key={a.id} className="row" style={{ alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                  <span className="num" style={{ width: 46, flex: "none", color: a.time ? "var(--amb)" : "var(--mu2)", fontSize: 12.5, paddingTop: 1 }}>{a.time ?? "Any time"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5 }}>{a.body}</div>
                    <div className="mu2" style={{ fontSize: 11, marginTop: 2 }}>Added by {firstName(a.created_by?.name ?? "")}</div>
                  </div>
                  <RemoveButton onClick={() => void remove(a.id).catch(() => {})} />
                </div>
              ))}
              <AddActivity onAdd={(time, body) => add({ kind: "ACTIVITY", day: current, time: time || undefined, body })} />
            </div>
          )}
        </div>

        {/* ---------- to-dos ---------- */}
        <div>
          <div className="eyebrow" style={{ fontSize: 9.5 }}>Before we go</div>
          {todos.length > 0 && <div className="meter" style={{ marginTop: 10 }}><i style={{ width: `${(doneCount / todos.length) * 100}%`, background: "var(--ok)" }} /></div>}
          <div style={{ marginTop: 8 }}>
            {todos.length === 0 && <div className="mu2" style={{ fontSize: 12.5, padding: "14px 0" }}>No to-dos yet. Try visas, travel insurance or airport transfer.</div>}
            {todos.map((t) => (
              <div key={t.id} className="row" style={{ gap: 10, padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                <button type="button" aria-label={t.done ? "Mark as not done" : "Mark as done"} onClick={() => void toggle(t.id).catch(() => {})}
                  className="tick" style={{ width: 20, height: 20, border: 0, cursor: "pointer", ...(t.done ? {} : { background: "transparent", boxShadow: "inset 0 0 0 1.5px var(--ring)", color: "transparent" }) }}>✓</button>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--mu2)" : undefined }}>{t.body}</div>
                {t.assignee && <span title={t.assignee.name} className="row" style={{ gap: 5, fontSize: 11.5, color: "var(--mu)" }}><Avatar id={t.assignee.id} name={t.assignee.name} size={20} />{firstName(t.assignee.name)}</span>}
                <RemoveButton onClick={() => void remove(t.id).catch(() => {})} />
              </div>
            ))}
            <AddTodo members={g.members.map((m) => ({ id: m.id, name: m.name, username: m.username }))} onAdd={(body, assignee) => add({ kind: "TODO", body, assignee_id: assignee || undefined })} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return <button type="button" aria-label="Remove" title="Remove" onClick={onClick} style={{ background: "none", border: 0, color: "var(--mu2)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "2px 4px" }}>×</button>;
}

/** Shared add-form behaviour: clears on success, keeps the text if the server refuses it. */
function useAddForm(submit: () => Promise<unknown>, reset: () => void) {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    onSubmit: async (e: FormEvent) => {
      e.preventDefault();
      setBusy(true);
      try { await submit(); reset(); } catch (err) { if (!(err instanceof ApiError)) throw err; } finally { setBusy(false); }
    },
  };
}

function AddActivity({ onAdd }: { onAdd: (time: string, body: string) => Promise<unknown> }) {
  const [time, setTime] = useState("");
  const [body, setBody] = useState("");
  const f = useAddForm(() => onAdd(time, body.trim()), () => { setBody(""); setTime(""); });
  return (
    <form className="row" style={{ gap: 6, marginTop: 12 }} onSubmit={f.onSubmit}>
      <input className="in" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 110, flex: "none" }} title="Time (optional)" />
      <input className="in" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add an activity, e.g. Fushimi Inari at sunrise" maxLength={200} style={{ flex: 1 }} />
      <button className="btn sm bp" disabled={f.busy || !body.trim()}>Add</button>
    </form>
  );
}

function AddTodo({ members, onAdd }: { members: { id: string; name: string; username: string }[]; onAdd: (body: string, assignee: string) => Promise<unknown> }) {
  const [body, setBody] = useState("");
  const [who, setWho] = useState("");
  const f = useAddForm(() => onAdd(body.trim(), who), () => { setBody(""); setWho(""); });
  return (
    <form style={{ marginTop: 12 }} onSubmit={f.onSubmit}>
      <input className="in" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a to-do" maxLength={200} />
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <select className="in" value={who} onChange={(e) => setWho(e.target.value)} style={{ flex: 1 }}>
          <option value="">Anyone can do it</option>
          {members.map((m) => <option key={m.id} value={m.id}>{firstName(m.name)} (@{m.username})</option>)}
        </select>
        <button className="btn sm bp" disabled={f.busy || !body.trim()}>Add</button>
      </div>
    </form>
  );
}
