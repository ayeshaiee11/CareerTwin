import { useEffect, useState, type ReactNode } from "react";
import type { Dashboard } from "./api";

export type Run = (key: string, action: () => Promise<unknown>, okMsg?: string) => Promise<boolean>;
export type PageProps = { d: Dashboard; run: Run; busy: string | null };

// Styles live in index.css (.btn-primary / .btn-ghost) so buttons match the dusk theme.
export const inputCls = "w-full px-3.5 py-2.5 disabled:opacity-60";
export const primaryBtn = "btn-primary";
export const ghostBtn = "btn-ghost";

/** Comma-joined list, or "none" when empty. */
export const list = (items?: string[] | null) => (items && items.length ? items.join(", ") : "none");

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-2">
      <h1 className="break-words font-display text-5xl font-extrabold leading-none tracking-tight md:text-6xl">{title}</h1>
      {children && <p className="mt-3 max-w-2xl text-lg text-slate-300">{children}</p>}
    </header>
  );
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block font-bold">{label}</label>
      {hint && <p id={`${id}-hint`} className="text-sm text-slate-400">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return <div role="alert" className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 font-medium text-rose-100">{children}</div>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <div role="status" className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 font-medium text-emerald-100">{children}</div>;
}

/** Number that counts up once when it mounts. Respects reduced motion. */
export function CountUp({ to, ms = 1100, suffix = "" }: { to: number; ms?: number; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <span className="tabular-nums">{v}{suffix}</span>;
}

/** Call once in App: feeds the cursor position to every .spot card. */
export function useSpotlight() {
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest?.(".spot") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", on);
    return () => document.removeEventListener("pointermove", on);
  }, []);
}