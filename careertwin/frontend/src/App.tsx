import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, FileText, FolderGit2, LayoutDashboard, MessagesSquare, Route, ShieldCheck, Sparkles, Trash2, UserRound, X } from "lucide-react";
import {
  addMilestone, ApiError, createProfile, type Dashboard, deleteMilestone, deleteProfile, getDashboard,
  startDemo, toggleMilestone, updateProfile, type ProfileValues,
} from "./api";
import { Alert, ghostBtn, inputCls, list, Notice, PageTitle, primaryBtn, type PageProps, type Run } from "./ui";
import { ProfileForm } from "./ProfileForm";
import { ResumePage } from "./ResumePage";
import { ProjectsPage } from "./ProjectsPage";
import { InterviewPage } from "./InterviewPage";
import { RoadmapPage } from "./RoadmapPage";
import { ShowcasePage } from "./ShowcasePage";

type Page = "dashboard" | "profile" | "resume" | "projects" | "interview" | "roadmap" | "showcase" | "privacy";

const LABELS: Record<string, string> = {
  skill_coverage: "Skill coverage", resume_alignment: "Resume alignment", project_evidence: "Project evidence",
  interview_prep: "Interview preparation", learning_progress: "Learning progress",
};
const BLURBS: Record<string, string> = {
  skill_coverage: "Skills you have, against what the role needs",
  resume_alignment: "How much of a job posting your resume covers",
  project_evidence: "Skills you have shown in real projects",
  interview_prep: "Questions you feel ready to answer",
  learning_progress: "Milestones you have finished",
};
// Where a user goes to fill in the data an indicator is waiting for.
const FIX: Record<string, [Page, string]> = {
  skill_coverage: ["profile", "Edit profile"], resume_alignment: ["resume", "Open Resume match"],
  project_evidence: ["projects", "Open Projects"], interview_prep: ["interview", "Open Interview practice"],
};
const NAV = [
  ["dashboard", "Dashboard", LayoutDashboard], ["profile", "Profile", UserRound], ["resume", "Resume match", FileText],
  ["projects", "Projects", FolderGit2], ["interview", "Interview practice", MessagesSquare],
  ["roadmap", "Skill roadmap", Route], ["showcase", "Showcase", Sparkles],
  ["privacy", "Settings and privacy", ShieldCheck],
] as const;
const KEY = "careertwin_profile_id";

// localStorage can throw (private mode, blocked storage); the app should still work without it.
const store = {
  get: (): number | null => { try { return Number(localStorage.getItem(KEY)) || null; } catch { return null; } },
  set: (v: number) => { try { localStorage.setItem(KEY, String(v)); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};

const calm = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const overallOf = (d: Dashboard): number | null => {
  const s = Object.values(d.indicators ?? {}).map((i) => i.score).filter((v): v is number => typeof v === "number");
  return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
};
const wordFor = (v: number) => (v < 25 ? "Just starting" : v < 50 ? "Getting there" : v < 75 ? "Solid" : "Strong");

/** Small burst of confetti where the person clicked. Pure DOM, no library. */
function burst(x: number, y: number) {
  if (calm()) return;
  const colors = ["#e0437c", "#ffb454", "#7c5cff", "#ffffff"];
  for (let i = 0; i < 20; i++) {
    const el = document.createElement("span");
    const size = 5 + Math.random() * 6;
    Object.assign(el.style, {
      position: "fixed", left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size * 0.6}px`, borderRadius: "2px",
      background: colors[i % colors.length], pointerEvents: "none", zIndex: "9999",
    });
    document.body.appendChild(el);
    const a = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 100;
    const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist - 40;
    el.animate(
      [{ transform: "translate(0,0) rotate(0deg)", opacity: 1 },
       { transform: `translate(${dx}px, ${dy + 90}px) rotate(${Math.random() * 600}deg)`, opacity: 0 }],
      { duration: 800 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" },
    ).onfinish = () => el.remove();
  }
}

/** Feeds the pointer position to any .spot card so its border and glow can follow the cursor. */
function useSpotlight() {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const card = (e.target as Element | null)?.closest?.(".spot") as HTMLElement | null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
}

/** Eases a number up to its target (and between new targets). */
function useCountUp(target: number | null, ms = 1200) {
  const [v, setV] = useState<number | null>(target === null || calm() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (target === null || calm()) { setV(target); if (target !== null) from.current = target; return; }
    const start = from.current, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      from.current = start + (target - start) * e;
      setV(Math.round(from.current));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Two overlapping rings: you and the role you are aiming for. */
function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden fill="none" strokeWidth="3">
      <circle cx="12" cy="17" r="9" style={{ stroke: "var(--color-accent)" }} />
      <circle cx="22" cy="17" r="9" style={{ stroke: "var(--color-gold)" }} />
    </svg>
  );
}

/** Circular score. The ring draws itself once and the number counts up. */
function Ring({ value, size = 64, stroke = 7, big = false }: { value: number | null; size?: number; stroke?: number; big?: boolean }) {
  const gid = "rg" + useId().replace(/:/g, "");
  const shown = useCountUp(value);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-accent)" }} /><stop offset="100%" style={{ stopColor: "var(--color-gold)" }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="rgba(255,255,255,0.09)" strokeDasharray={value === null ? "2 7" : undefined} strokeLinecap="round" />
        {value !== null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={`url(#${gid})`}
            className="ring-anim transition-[stroke-dashoffset] duration-1000" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
            style={{ ["--c" as string]: c, filter: big ? "drop-shadow(0 0 8px rgb(224 67 124 / 0.55))" : undefined }} />)}
      </svg>
      <div className="absolute inset-0 grid place-items-center font-display font-bold tabular-nums" style={{ fontSize: size * (big ? 0.27 : 0.28) }}>
        {shown === null ? <span className="text-slate-400">–</span> : <span>{shown}<span className="text-slate-400" style={{ fontSize: "0.55em" }}>%</span></span>}
      </div>
    </div>
  );
}

/** Landing hero: you and the role you want, overlapping. Leans toward the pointer. */
function TwinOrbit() {
  const [t, setT] = useState({ x: 0, y: 0 });
  const chips: { label: string; v: number; cls: string; d: string }[] = [
    { label: "Skill coverage", v: 62, cls: "left-0 top-4", d: "0s" },
    { label: "Project evidence", v: 60, cls: "right-0 top-[46%]", d: "-2s" },
    { label: "Resume match", v: 74, cls: "bottom-4 left-6", d: "-4s" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-lg"
      onPointerMove={(e) => {
        if (calm()) return;
        const r = e.currentTarget.getBoundingClientRect();
        setT({ x: ((e.clientX - r.left) / r.width - 0.5) * 14, y: -((e.clientY - r.top) / r.height - 0.5) * 14 });
      }}
      onPointerLeave={() => setT({ x: 0, y: 0 })}>
      <div style={{ transform: `perspective(1000px) rotateX(${t.y}deg) rotateY(${t.x}deg)`, transition: "transform .25s ease-out" }}>
        <svg viewBox="0 0 480 380" className="h-auto w-full" aria-hidden>
          <defs>
            <linearGradient id="to-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: "var(--color-accent)" }} /><stop offset="1" style={{ stopColor: "var(--color-violet)" }} /></linearGradient>
            <linearGradient id="to-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: "var(--color-gold)" }} /><stop offset="1" style={{ stopColor: "var(--color-accent)" }} /></linearGradient>
            <clipPath id="to-clip"><circle cx="195" cy="190" r="110" /></clipPath>
            <radialGradient id="to-glow"><stop offset="0" stopColor="#fff" stopOpacity="0.55" /><stop offset="1" stopColor="#fff" stopOpacity="0.05" /></radialGradient>
          </defs>
          <g className="orbit-a">
            <circle cx="240" cy="190" r="165" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" />
            <circle cx="405" cy="190" r="6" style={{ fill: "var(--color-accent)" }} /><circle cx="75" cy="190" r="4" style={{ fill: "var(--color-gold)" }} />
          </g>
          <g className="orbit-b">
            <circle cx="240" cy="190" r="185" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1.5" />
            <circle cx="240" cy="5" r="5" style={{ fill: "var(--color-gold)" }} /><circle cx="240" cy="375" r="4" style={{ fill: "var(--color-violet)" }} />
          </g>
          <circle cx="195" cy="190" r="110" fill="rgba(224,67,124,0.10)" stroke="url(#to-a)" strokeWidth="3" />
          <circle cx="285" cy="190" r="110" fill="rgba(255,180,84,0.08)" stroke="url(#to-b)" strokeWidth="3" />
          <circle className="lens" cx="285" cy="190" r="110" clipPath="url(#to-clip)" fill="url(#to-glow)" />
          <g className="font-display" fill="white" textAnchor="middle" fontWeight="700">
            <text x="145" y="196" fontSize="24">You</text>
            <text x="338" y="196" fontSize="24">Target role</text>
            <text x="240" y="196" fontSize="15" fill="#2a1844">fit</text>
          </g>
        </svg>
        {chips.map((c) => (
          <div key={c.label} style={{ ["--d" as string]: c.d }}
            className={`float absolute ${c.cls} flex items-center gap-2 rounded-2xl border border-line bg-panel/90 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur`}>
            <Ring value={c.v} size={38} stroke={5} /><span className="pr-1 text-sm font-medium">{c.label}</span>
          </div>))}
      </div>
      <p className="mt-2 text-center text-xs text-slate-400">Sample numbers</p>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center overflow-hidden p-6"><div className="w-full max-w-6xl">{children}</div></main>;
}

export default function App() {
  useSpotlight();
  const [id, setId] = useState<number | null>(store.get);
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"choose" | "create">("choose");
  const [busy, setBusy] = useState<string | null>(null); // key of the write in progress
  const [page, setPage] = useState<Page>("dashboard");

  const load = useCallback(async (pid: number) => {
    try { setData(await getDashboard(pid)); setErr(""); }
    catch (e) {
      if (e instanceof ApiError && e.status === 404) { store.clear(); setId(null); setData(null); }
      // Any other failure (backend down, timeout) keeps the saved profile so the user can retry.
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { if (id) load(id); }, [id, load]);

  const enter = async (make: () => Promise<{ id: number }>) => {
    setCreating(true); setErr("");
    try { const { id: newId } = await make(); store.set(newId); setId(newId); setPage("dashboard"); }
    catch (e) { setErr((e as Error).message); } finally { setCreating(false); }
  };
  const wipe = async () => {
    if (!id || !confirm("Delete this profile and all its data? This cannot be undone.")) return;
    try { await deleteProfile(id); }
    catch (e) { if (!(e instanceof ApiError && e.status === 404)) { setErr((e as Error).message); return; } }
    store.clear(); setId(null); setData(null); setErr(""); setNotice(""); setPage("dashboard"); setMode("choose");
  };
  // One guarded runner for every write: blocks double submits, refreshes, and surfaces errors.
  const run: Run = async (key, action, okMsg) => {
    if (busy !== null || !id) return false;
    setBusy(key); setErr(""); setNotice("");
    try { await action(); await load(id); if (okMsg) setNotice(okMsg); return true; }
    catch (e) { setErr((e as Error).message); return false; } finally { setBusy(null); }
  };

  // A saved profile is still loading: show that instead of flashing the landing page.
  if (id && !data && !err) return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="flex items-center gap-3 text-slate-300"><Logo /><p role="status">Loading your dashboard…</p></div></main>);

  // A saved profile exists but could not be loaded (backend down, timeout): offer retry, keep the profile.
  if (id && !data) return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="max-w-xl">
        <h1 className="text-3xl font-bold">Couldn't load your dashboard</h1>
        <Alert>{err}</Alert>
        <div className="mt-6 flex gap-3">
          <button onClick={() => { setErr(""); load(id); }} className={primaryBtn}>Try again</button>
          <button onClick={() => { store.clear(); setId(null); setErr(""); }} className={ghostBtn}>Start over</button>
        </div>
      </div>
    </main>);

  if (!id || !data) return (
    <Shell>
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rise">
          <div className="flex items-center gap-3"><Logo /><span className="font-display text-xl font-bold">CareerTwin</span></div>
          <h1 className="mt-8 bg-gradient-to-b from-white to-slate-300 bg-clip-text pb-2 text-5xl font-bold leading-[1.02] tracking-tight text-transparent md:text-7xl">Know where you stand before you apply.</h1>
          {mode === "choose" ? (<>
            <p className="mt-5 max-w-lg text-lg text-slate-300">CareerTwin compares your skills with a target role and shows exactly how each score is calculated. Create your own profile, or open a fictional demo to look around.</p>
            {err && <Alert>{err}</Alert>}
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => { setErr(""); setMode("create"); }} className={primaryBtn}>Create my profile</button>
              <button onClick={() => enter(startDemo)} disabled={creating} className={ghostBtn}>{creating ? "Setting up demo…" : "Open demo profile"}</button>
            </div>
          </>) : (<>
            <p className="mt-5 max-w-lg text-slate-300">Only a name is required. Everything stays in a local database on this machine.</p>
            {err && <Alert>{err}</Alert>}
            <ProfileForm submitLabel="Create profile" savingLabel="Creating…" saving={creating} disabled={creating}
              onSubmit={(v: ProfileValues) => enter(() => createProfile(v))} />
            <button onClick={() => { setErr(""); setMode("choose"); }} disabled={creating} className={`${ghostBtn} mt-4`}>Back</button>
          </>)}
        </div>
        <div className="rise" style={{ ["--d" as string]: "200ms" }}><TwinOrbit /></div>
      </div>
    </Shell>);

  const props: PageProps = { d: data, run, busy };
  const overall = overallOf(data);
  return (
    <div className="min-h-screen md:flex">
      <nav aria-label="Main" className="print:hidden sticky top-0 z-20 flex items-center gap-1 overflow-x-auto border-b border-line bg-ink/70 p-3 backdrop-blur-xl md:h-screen md:w-72 md:shrink-0 md:flex-col md:items-stretch md:overflow-y-auto md:border-r md:border-b-0 md:p-5">
        <div className="hidden items-center gap-3 px-2 pb-6 pt-1 md:flex"><Logo /><span className="font-display text-xl font-bold tracking-tight">CareerTwin</span></div>
        {NAV.map(([k, label, Icon]) => {
          const on = page === k;
          return (
            <button key={k} onClick={() => { setPage(k); setNotice(""); }} aria-current={on ? "page" : undefined}
              className={`relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all ${on ? "bg-gradient-to-r from-accent/25 to-transparent text-white" : "text-slate-300 hover:translate-x-0.5 hover:bg-white/5 hover:text-white"}`}>
              {on && <span aria-hidden className="absolute bottom-2 left-0 top-2 hidden w-1 rounded-full bg-gold shadow-[0_0_12px] shadow-gold md:block" />}
              <Icon size={18} aria-hidden className={on ? "text-gold" : ""} /> {label}</button>);
        })}
        <div className="mt-auto hidden items-center gap-3 rounded-2xl border border-line bg-panel p-3 md:flex">
          <Ring value={overall} size={48} stroke={5} />
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{data.profile.name}</p><p className="truncate text-xs text-slate-400">{data.profile.target_role}</p></div>
        </div>
      </nav>
      <main className="min-w-0 max-w-5xl flex-1 p-5 pb-20 md:p-10">
        {err && <Alert>{err}</Alert>}
        {notice && <Notice>{notice}</Notice>}
        {page === "dashboard" && <Dash {...props} go={setPage} overall={overall} />}
        {page === "profile" && (<>
          <PageTitle title="Profile">Your target role and skills drive the skill coverage and project evidence scores.</PageTitle>
          <ProfileForm initial={data.profile} submitLabel="Save profile" savingLabel="Saving…" saving={busy === "profile"} disabled={busy !== null}
            onSubmit={(v) => run("profile", () => updateProfile(data.profile.id, v), "Profile saved.")} />
        </>)}
        {page === "resume" && <ResumePage {...props} />}
        {page === "projects" && <ProjectsPage {...props} />}
        {page === "interview" && <InterviewPage {...props} />}
        {page === "roadmap" && <RoadmapPage {...props} />}
        {page === "showcase" && <ShowcasePage {...props} />}
        {page === "privacy" && <Privacy demo={data.profile.is_demo} onDelete={wipe} />}
      </main>
    </div>);
}

function Dash({ d, run, busy, go, overall }: PageProps & { go: (p: Page) => void; overall: number | null }) {
  const [title, setTitle] = useState("");
  const cov = d.indicators.skill_coverage?.evidence;
  const matched: { skill: string }[] = cov?.matched ?? [];
  const missing: { skill: string; level: string }[] = cov?.missing ?? [];
  const off = busy !== null;
  const entries = Object.entries(d.indicators);
  const scored = entries.filter(([, v]) => v.score !== null).length;
  const done = d.milestones.filter((m) => m.done).length;
  return (<>
    <header className="spot rise relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-panel-2 to-panel p-6 shadow-xl shadow-black/30 md:p-9">
      <svg aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-96 w-96 opacity-25" viewBox="0 0 200 200" fill="none" strokeWidth="1.5">
        <circle cx="85" cy="100" r="60" style={{ stroke: "var(--color-accent)" }} /><circle cx="125" cy="100" r="60" style={{ stroke: "var(--color-gold)" }} />
      </svg>
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <h1 className="break-words text-4xl font-bold tracking-tight md:text-6xl">{d.profile.name}</h1>
          <p className="mt-3 text-lg text-slate-300">Aiming for <b className="font-semibold text-white">{d.profile.target_role}</b></p>
          {d.profile.is_demo && <p className="mt-1 text-sm text-slate-400">Sample data, not a real person.</p>}
        </div>
        <div className="flex items-center gap-5">
          <Ring value={overall} size={150} stroke={13} big />
          <div className="max-w-40"><p className="font-display text-xl font-semibold">{overall === null ? "No score yet" : wordFor(overall)}</p>
            <p className="text-sm text-slate-400">Average of the {scored} score{scored === 1 ? "" : "s"} with enough data.</p></div>
        </div>
      </div>
    </header>

    <section aria-label="Readiness indicators" className="mt-6 grid gap-4 md:grid-cols-2">
      {entries.map(([k, v], i) => {
        const ev = v.evidence ?? {};
        return (
          <details key={k} style={{ ["--d" as string]: `${150 + i * 90}ms` }}
            className="spot rise group rounded-2xl border border-line bg-panel p-5 transition-colors open:border-accent/50">
            <summary className="flex cursor-pointer list-none items-center gap-4 [&::-webkit-details-marker]:hidden">
              <div role="meter" aria-valuenow={v.score ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label={LABELS[k] ?? k}><Ring value={v.score} size={68} stroke={7} /></div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-semibold leading-tight">{LABELS[k] ?? k}</p>
                <p className="text-sm text-slate-400">{v.score === null ? "Not enough data yet" : BLURBS[k] ?? wordFor(v.score)}</p>
              </div>
              <ChevronDown size={18} aria-hidden className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-4 border-t border-line pt-4 text-sm text-slate-300">
              {v.score === null ? (<>
                <p>{v.reason ?? "Not enough data yet."}</p>
                {FIX[k] && <button onClick={() => go(FIX[k][0])} className="mt-3 rounded-lg bg-accent/15 px-3 py-1.5 font-medium text-white hover:bg-accent/30">{FIX[k][1]}</button>}
              </>) : (<>
                {ev.formula && <p>How it's calculated: {ev.formula}</p>}
                {k === "skill_coverage" && <p className="mt-2"><b>Matched:</b> {matched.map((m) => m.skill).join(", ") || "none"}<br />
                  <b>Missing:</b> {missing.map((m) => `${m.skill} (${m.level})`).join(", ") || "none"}</p>}
                {k === "resume_alignment" && <p className="mt-2"><b>Found in your resume:</b> {list(ev.matched)}<br /><b>Not found:</b> {list(ev.missing)}</p>}
                {k === "project_evidence" && <p className="mt-2"><b>Shown in a project:</b> {list(ev.shown?.map((s: { skill: string }) => s.skill))}<br /><b>Not shown yet:</b> {list(ev.not_shown)}</p>}
                {k === "interview_prep" && <p className="mt-2">{ev.confident} of {ev.total} questions rated 4 or 5; {ev.practiced} practiced.</p>}
                {k === "learning_progress" && <p className="mt-2">{ev.done} of {ev.total} milestones done.</p>}
                {ev.note && <p className="mt-2 text-slate-400">{ev.note}</p>}
              </>)}
            </div>
          </details>);
      })}
    </section>
    <p className="mt-3 text-xs text-slate-400">{d.note}</p>

    <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
      <h2 className="text-2xl font-semibold">Milestones</h2>
      {d.milestones.length > 0 && <p className="text-sm text-slate-400">{done} of {d.milestones.length} done</p>}
    </div>
    {d.milestones.length > 0 && (
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full rounded-full bg-gradient-to-r from-accent via-gold to-gold shadow-[0_0_14px] shadow-accent/60 transition-all duration-700" style={{ width: `${(100 * done) / d.milestones.length}%` }} /></div>)}
    {d.milestones.length === 0 && <p className="mt-3 text-slate-400">No milestones yet. Add one below to start tracking progress.</p>}
    <ul className="mt-4 space-y-2">
      {d.milestones.map((m) => (
        <li key={m.id} className="flex gap-2">
          <button onClick={(e) => { if (!m.done) burst(e.clientX, e.clientY); run("m" + m.id, () => toggleMilestone(m.id)); }} aria-pressed={m.done} disabled={off} aria-busy={busy === "m" + m.id}
            className="spot flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-left transition-colors hover:border-accent/60 disabled:opacity-60">
            {m.done
              ? <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-white shadow-[0_0_12px] shadow-accent/70" aria-hidden><Check size={14} /></span>
              : <span className="h-6 w-6 shrink-0 rounded-full border-2 border-slate-400/60" aria-hidden />}
            <span className={`break-words ${m.done ? "text-slate-400 line-through" : ""}`}>{m.title}</span></button>
          <button onClick={() => run("m" + m.id, () => deleteMilestone(m.id))} disabled={off} aria-label={`Delete milestone: ${m.title}`}
            className="rounded-xl border border-line bg-panel px-3 text-slate-400 hover:border-red-400/50 hover:text-red-200 disabled:opacity-60">
            <X size={16} aria-hidden /></button></li>))}
    </ul>
    <form className="mt-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (title.trim() && await run("add", () => addMilestone(d.profile.id, title.trim()))) setTitle(""); }}>
      <label className="sr-only" htmlFor="new-milestone">New milestone</label>
      <input id="new-milestone" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Add a milestone" className={`${inputCls} min-w-0 flex-1`} />
      <button type="submit" disabled={off || !title.trim()} className={primaryBtn}>{busy === "add" ? "Adding…" : "Add"}</button>
    </form>
  </>);
}

function Privacy({ demo, onDelete }: { demo: boolean; onDelete: () => void }) {
  return (<>
    <PageTitle title="Settings and privacy">
      Your profile, skills, milestones, resume text, projects and interview answers are stored in a local SQLite file on the machine running the backend. Nothing is sent to third parties in this version. {demo && "You are using fictional demo data."}
    </PageTitle>
    <button onClick={onDelete} className="mt-6 flex items-center gap-2 rounded-xl border border-red-400/50 px-4 py-2 text-red-200 hover:bg-red-400/10">
      <Trash2 size={18} aria-hidden /> Delete this profile and all its data</button>
  </>);
}