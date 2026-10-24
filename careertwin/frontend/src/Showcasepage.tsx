import { useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import type { PageProps } from "./ui";
import { Radar3D } from "./Radar3D";

// Skill areas shown on the radar. Matching is by lowercase name, with a few common spellings.
const AREAS: Record<string, string[]> = {
  Programming: ["python", "r", "sql", "java", "c++", "c#", "go", "scala", "matlab", "javascript", "typescript", "rust"],
  "Data & Analysis": ["pandas", "numpy", "scipy", "data analysis", "data cleaning", "statistics", "feature engineering", "excel", "data visualization", "matplotlib", "seaborn", "tableau", "power bi"],
  "Machine Learning": ["scikit-learn", "machine learning", "xgboost", "model evaluation"],
  "Deep Learning & AI": ["tensorflow", "pytorch", "keras", "deep learning", "nlp", "computer vision", "opencv", "llms", "hugging face", "prompt engineering"],
  "Tools & MLOps": ["git", "github", "docker", "jupyter", "streamlit", "fastapi", "flask", "linux", "airflow", "spark", "kubernetes", "ci/cd", "unit testing"],
  "Cloud & Data": ["aws", "azure", "gcp", "postgresql", "mysql", "mongodb", "sqlite", "kafka", "etl", "rest apis"],
};
const ALIAS: Record<string, string> = { sklearn: "scikit-learn", "scikit learn": "scikit-learn", golang: "go", postgres: "postgresql", "natural language processing": "nlp" };
const AREA_NAMES = Object.keys(AREAS);
const norm = (s: string) => { const k = s.trim().toLowerCase(); return ALIAS[k] ?? k; };
const areaOf = (s: string) => AREA_NAMES.find((a) => AREAS[a].includes(norm(s))) ?? "Other";


function titleFor(score: number | null) {
  if (score === null) return "Just getting started";
  if (score < 25) return "Getting started";
  if (score < 50) return "Building momentum";
  if (score < 75) return "Almost interview-ready";
  return "Standing out";
}

export function ShowcasePage({ d }: PageProps) {
  const [copied, setCopied] = useState(false);

  const skills = d.profile.skills ?? [];
  const shown: { skill: string; projects: string[] }[] = d.indicators?.project_evidence?.evidence?.shown ?? [];
  const proven = new Map(shown.map((s) => [norm(s.skill), s.projects]));
  const isProven = (s: string) => proven.has(norm(s));

  const claimed = AREA_NAMES.map((a) => skills.filter((s) => areaOf(s) === a).length);
  const backed = AREA_NAMES.map((a) => skills.filter((s) => areaOf(s) === a && isProven(s)).length);
  const frac = (n: number) => Math.min(1, n / 4); // 4 or more skills fills an axis

  const scores = Object.values(d.indicators ?? {}).map((i) => i.score).filter((v): v is number => typeof v === "number");
  const overall = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const C = 2 * Math.PI * 54;

  const projects = d.projects ?? [];
  const doneMs = (d.milestones ?? []).filter((m) => m.done).length;
  const ip = d.indicators?.interview_prep?.evidence;
  const provenCount = skills.filter(isProven).length;

  const grouped = [...AREA_NAMES, "Other"].map((a) => ({ a, list: skills.filter((s) => areaOf(s) === a) })).filter((g) => g.list.length);

  const summary = [
    `${d.profile.name} | Target: ${d.profile.target_role}`,
    `Skills: ${skills.join(", ") || "none yet"}`,
    `Proven in projects: ${skills.filter(isProven).join(", ") || "none yet"}`,
    `Projects built: ${projects.map((p) => p.title).join("; ") || "none yet"}`,
    overall !== null ? `Overall readiness: ${overall}% (self-tracked in CareerTwin)` : "",
  ].filter(Boolean).join("\n");

  const copy = async () => {
    try { await navigator.clipboard.writeText(summary); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard blocked: ignore */ }
  };

  return (<>
    <style>{`
      @keyframes sc-ring { from { stroke-dashoffset: ${C} } }
      @keyframes sc-rise { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }
      .sc-ring { animation: sc-ring 1.4s ease-out both }
      .sc-rise { animation: sc-rise .6s ease-out both }
      @media (prefers-reduced-motion: reduce) { .sc-ring, .sc-rise { animation: none } }
      @media print { body { background: white !important } }
    `}</style>

    <div className="print:hidden mt-2 flex flex-wrap justify-end gap-2">
      <button onClick={copy} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-slate-200 hover:border-accent">
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}{copied ? "Copied!" : "Copy summary"}</button>
      <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-slate-200 hover:border-accent">
        <Printer size={16} aria-hidden /> Print / Save as PDF</button>
    </div>

    <section aria-label="Profile summary" className="sc-rise mt-4 grid items-center gap-6 rounded-2xl border border-line bg-gradient-to-br from-accent/25 via-panel to-panel p-6 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="text-sm uppercase tracking-widest text-slate-400">{titleFor(overall)}</p>
        <h1 className="mt-1 break-words text-4xl font-bold">{d.profile.name}</h1>
        <p className="mt-1 text-lg text-slate-300">Aiming for {d.profile.target_role}</p>
        {d.profile.education && <p className="text-slate-400">{d.profile.education}</p>}
        {d.profile.is_demo && <p className="mt-2 text-xs text-slate-400">Sample data, not a real person.</p>}
      </div>
      <div className="relative mx-auto h-36 w-36" role="img" aria-label={overall === null ? "Overall readiness not available yet" : `Overall readiness ${overall} percent`}>
        <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
          <circle cx="60" cy="60" r="54" fill="none" strokeWidth="9" className="stroke-white/10" />
          <circle cx="60" cy="60" r="54" fill="none" strokeWidth="9" strokeLinecap="round" className="sc-ring stroke-current text-accent"
            strokeDasharray={C} strokeDashoffset={C * (1 - (overall ?? 0) / 100)} />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div><p className="text-3xl font-bold tabular-nums">{overall === null ? "–" : `${overall}%`}</p>
            <p className="text-xs text-slate-400">readiness</p></div>
        </div>
      </div>
    </section>

    <section aria-label="Highlights" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {[
        [skills.length, "skills listed"], [provenCount, "proven in projects"],
        [projects.length, projects.length === 1 ? "project built" : "projects built"], [doneMs, "milestones done"],
      ].map(([n, label], i) => (
        <div key={label as string} className="sc-rise rounded-xl border border-line bg-panel p-4 text-center" style={{ animationDelay: `${0.1 * i}s` }}>
          <p className="text-3xl font-bold tabular-nums">{n}</p><p className="text-sm text-slate-400">{label}</p></div>))}
    </section>

    <section aria-label="Skill towers" className="mt-4 rounded-2xl border border-line bg-panel p-5">
      <h2 className="text-xl font-semibold">Skill towers</h2>
      <p className="text-sm text-slate-400">Each tower is a skill area. The solid tower is skills you have used in a project. The glass tower is skills you list. Four or more skills fills a tower.</p>
      <Radar3D areas={AREA_NAMES.map((name, i) => ({ name, claimed: claimed[i], backed: backed[i] }))} />
    </section>

    <section aria-label="Skills by area" className="mt-4 rounded-2xl border border-line bg-panel p-5">
      <h2 className="text-xl font-semibold">Skills</h2>
      {grouped.length === 0 && <p className="mt-2 text-slate-400">Add skills on the Profile page to fill this in.</p>}
      <div className="mt-3 space-y-4">
        {grouped.map(({ a, list }) => (
          <div key={a}>
            <p className="text-sm text-slate-400">{a}</p>
            <p className="mt-1 flex flex-wrap gap-2">
              {list.map((s) => isProven(s)
                ? <span key={s} title={`Used in: ${proven.get(norm(s))?.join(", ")}`} className="flex items-center gap-1 rounded-full border border-accent bg-accent/25 px-3 py-1 text-sm text-white shadow-[0_0_12px_-2px] shadow-accent"><Check size={14} aria-hidden /> {s}<span className="sr-only"> (proven in a project)</span></span>
                : <span key={s} className="rounded-full border border-line px-3 py-1 text-sm text-slate-300">{s}</span>)}
            </p>
          </div>))}
      </div>
    </section>

    {projects.length > 0 && (
      <section aria-label="Projects" className="mt-4 rounded-2xl border border-line bg-panel p-5">
        <h2 className="text-xl font-semibold">What I built</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <article key={p.id} className="rounded-xl border border-line p-4">
              <h3 className="break-words font-semibold">{p.title}</h3>
              {p.description && <p className="mt-1 break-words text-sm text-slate-300">{p.description}</p>}
              <p className="mt-2 flex flex-wrap gap-1.5">{(p.skills ?? []).map((s) => <span key={s} className="rounded bg-white/10 px-2 py-0.5 text-xs">{s}</span>)}</p>
              {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block break-all text-sm text-accent underline">{p.url}</a>}
            </article>))}
        </div>
      </section>)}

    {ip?.practiced > 0 && (
      <p className="mt-4 text-sm text-slate-400">Interview practice: {ip.practiced} question{ip.practiced > 1 ? "s" : ""} practiced, {ip.confident} rated 4 or 5 (self-assessed).</p>)}
    <p className="mt-2 text-xs text-slate-500">Scores are transparent heuristics from data entered in CareerTwin, not a prediction of hiring outcomes.</p>
  </>);
}