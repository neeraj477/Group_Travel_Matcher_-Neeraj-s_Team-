import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "./theme";
import { initials, inr, range, type CostPreview, type Interest, type Me, type Meta, type RuleResult } from "./api";
import { scene } from "./scenes";

// ---------- app-wide context ----------
export interface AppCtx {
  me: Me | null; meta: Meta | null; refreshMe: () => Promise<void>;
  setUser: (id: string | null) => Promise<void>; toast: (msg: string, bad?: boolean) => void;
}
export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

/** Short chip label: "Temples and shrines" → "Temples". */
export const shortLabel = (i: Interest) => i.label.split(" and ")[0];
export function useInterestLabel() {
  const { meta } = useApp();
  return (id: string) => { const i = meta?.interests.find((x) => x.interest === id); return i ? shortLabel(i) : id; };
}

// ---------- visual pieces ----------
export function Scene({ kind, className = "", style, children }: { kind: string; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const svg = useMemo(() => scene(kind), [kind]);
  return (
    <div className={"ph " + className} style={style}>
      <div className="scw" dangerouslySetInnerHTML={{ __html: svg }} />
      {children}
    </div>
  );
}

const AV = ["c1", "c2", "c3", "c4"];
/** Stable colour per traveller id. */
export const avClass = (id: string) => AV[[...id].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AV.length];
export function Avatar({ id, name, size = 30, style }: { id: string; name: string; size?: number; style?: CSSProperties }) {
  return <div className={"av " + avClass(id)} title={name} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.32), ...style }}>{initials(name)}</div>;
}

export function Ring({ value, delay = 0 }: { value: number; delay?: number }) {
  const off = 170 - (170 * Math.max(0, Math.min(100, value))) / 100;
  return (
    <div className="ring">
      <svg width="62" height="62"><circle className="t" cx="31" cy="31" r="27" /><circle className="p" cx="31" cy="31" r="27" style={{ ["--off" as string]: off, animationDelay: `${0.5 + delay}s` } as CSSProperties} /></svg>
      <b>{value}</b>
    </div>
  );
}

export function Rules({ rules }: { rules: RuleResult[] }) {
  return <>{rules.map((r) => (
    <div className="rule" key={r.key} title={r.detail}><span className={"tick" + (r.pass ? "" : " x")}>{r.pass ? "✓" : "✕"}</span>{r.label}<span className="v">{r.value}</span></div>
  ))}</>;
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map((o) => <button type="button" key={String(o.value)} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}

export function InterestChips({ value, onChange, interests, highlight }: { value: string[]; onChange: (v: string[]) => void; interests: Interest[]; highlight?: boolean }) {
  return (
    <div className="chips">
      {interests.map((i, idx) => {
        const on = value.includes(i.interest);
        return (
          <button type="button" key={i.interest} className={"chip" + (on ? " on" : "") + (on && highlight ? " pop" : "")} style={{ animationDelay: `${idx * 40}ms` }}
            onClick={() => onChange(on ? value.filter((v) => v !== i.interest) : [...value, i.interest])}>
            {on ? "✓ " : ""}{shortLabel(i)}
          </button>
        );
      })}
    </div>
  );
}

const COST_INFO = "Based on the cheapest room setup with free rooms on every night of the group's dates. Final hotel is chosen together on the group page.";

/** "Your seat makes it cheaper": the group's stay cost per person now vs. if you join. All numbers come from the API. */
export function CostStrip({ p, checkIn, checkOut }: { p: CostPreview; checkIn: string; checkOut: string }) {
  const { now, if_join: join, saving_per_member_inr: saving, budget_share_pct: pct } = p;
  return (
    <div className="cost">
      <div className="cost-main">
        {now && <span>Stay now <b>{inr(now.per_member_inr)} each</b> <span className="mu2">({now.guests} member{now.guests > 1 ? "s" : ""})</span></span>}
        {now && join && <span className="cost-arr">→</span>}
        {join && <span><b className="cost-amb">{inr(join.per_member_inr)} each</b> if you join</span>}
        {join && saving !== null && saving > 0 && <span className="cost-save">saves {inr(saving)}</span>}
        {join && pct !== null && <span className="mu2">{pct}% of your budget</span>}
        {!join && <span className="mu2">{p.reason}</span>}
        <span className="cost-info" title={COST_INFO} aria-label={COST_INFO} tabIndex={0}>i</span>
      </div>
      {join && <div className="cost-sub">Cheapest stay for {range(checkIn, checkOut)}: {join.hotel_name}, {join.rooms} × {join.room_name}</div>}
    </div>
  );
}

export function Modal({ children, onClose, width }: { children: ReactNode; onClose?: () => void; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return <div className="modal-bg" onClick={onClose}><div className="gl hi modal" style={width ? { width } : undefined} onClick={(e) => e.stopPropagation()}>{children}</div></div>;
}

export function Confetti() {
  const cols = ["#f0c48a", "#ffffff", "#cfd6e4", "#c27d45", "#7fd6a8"];
  const bits = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ left: Math.random() * 100, dur: 3 + Math.random() * 4, delay: -Math.random() * 6, c: cols[i % 5] })), []);
  return <div className="cf">{bits.map((b, i) => <i key={i} style={{ left: b.left + "%", background: b.c, animationDuration: b.dur + "s", animationDelay: b.delay + "s", opacity: 0.85 }} />)}</div>;
}

/** Counts a rupee amount up from 0 (en-IN grouping). */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const t0 = performance.now() + 300;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / 1400));
      setV(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <>{format(v)}</>;
}

export function Field({ label, error, hint, children, style }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return <div style={style}><label>{label}</label>{children}{error ? <div className="err">{error}</div> : hint ? <div className="hint">{hint}</div> : null}</div>;
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return <div className="empty mu"><span className="spin" /> <span style={{ marginLeft: 8 }}>{text}</span></div>;
}

/** Dark / light switch in the top nav. A real switch for screen readers: "Light mode", on or off. */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const light = theme === "light";
  return (
    <button type="button" role="switch" aria-checked={light} aria-label="Light mode" title={light ? "Switch to dark mode" : "Switch to light mode"}
      className={"theme-toggle" + (light ? " on" : "")} onClick={toggle}>
      <span className="theme-ic" aria-hidden>☾</span>
      <span className="theme-ic" aria-hidden>☀</span>
      <span className="theme-knob" aria-hidden />
    </button>
  );
}
