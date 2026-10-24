import { useEffect, useState } from "react";
import { addMilestone, getProjection } from "./api";
import { PageTitle, primaryBtn, type PageProps } from "./ui";

type Gap = { skill: string; level: string };

// Most important gaps first. Unknown level names land in the middle.
function rank(level: string): number {
  const l = level.toLowerCase();
  if (/core|required|must|essential|high|critical/.test(l)) return 0;
  if (/nice|bonus|optional|low|advanced|plus/.test(l)) return 2;
  return 1;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const weekTitle = (n: number, skills: string[]) =>
  `Week ${n}: learn ${skills.join(" + ")} and use it in a project`.slice(0, 120);

/** Line chart of the projected score: "Now", then after each week. */
function Climb({ points }: { points: (number | null)[] }) {
  const W = 640, H = 210, L = 36, R = 16, T = 16, B = 34;
  const n = points.length;
  const x = (i: number) => L + (n === 1 ? 0 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  const known = points.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
  const path = known.filter(Boolean).map((p) => `${p![0]},${p![1]}`).join(" ");
  const label = (i: number) => (i === 0 ? "Now" : `W${i}`);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[420px] text-slate-400" role="img"
        aria-label={`Projected skill coverage: ${points.map((v, i) => `${label(i)} ${v ?? "unknown"}%`).join(", ")}`}>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.2} />
            <text x={L - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill="currentColor">{g}%</text>
          </g>))}
        <polyline points={path} fill="none" strokeWidth={3} strokeLinejoin="round" className="stroke-current text-accent" />
        {points.map((v, i) => v === null ? null : (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r={5} className="fill-current text-accent" />
            <text x={x(i)} y={y(v) - 10} textAnchor="middle" fontSize="12" fontWeight="600" fill="white">{v}%</text>
          </g>))}
        {points.map((_, i) => (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="currentColor">{label(i)}</text>))}
      </svg>
    </div>
  );
}

export function RoadmapPage({ d, run, busy }: PageProps) {
  const [pace, setPace] = useState(1); // skills per week
  const [scores, setScores] = useState<(number | null)[] | null>(null);
  const [projErr, setProjErr] = useState(false);
  const off = busy !== null;

  const cov = d.indicators?.skill_coverage;
  const raw = cov?.evidence?.missing;
  const gaps: Gap[] = (Array.isArray(raw) ? raw : [])
    .filter((m: any) => m && typeof m.skill === "string")
    .map((m: any) => ({ skill: m.skill, level: String(m.level ?? "") }));
  const sorted = [...gaps].sort((a, b) => rank(a.level) - rank(b.level));
  const weeks = chunk(sorted, pace);
  const stepsKey = JSON.stringify(weeks.map((w) => w.map((g) => g.skill)));

  const existing = new Set((d.milestones ?? []).map((m) => m.title.toLowerCase()));
  const planned = weeks.map((w, i) => weekTitle(i + 1, w.map((g) => g.skill)));
  const isAdded = (t: string) => existing.has(t.toLowerCase());
  const toAdd = planned.filter((t) => !isAdded(t));

  // Ask the backend: what would my real coverage score be after each week?
  useEffect(() => {
    if (weeks.length === 0) { setScores(null); return; }
    let cancelled = false;
    setScores(null); setProjErr(false);
    getProjection(d.profile.id, weeks.map((w) => w.map((g) => g.skill)))
      .then((r) => { if (!cancelled) setScores(r.scores); })
      .catch(() => { if (!cancelled) setProjErr(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey, d.profile.id]);

  const now = typeof cov?.score === "number" ? cov.score : null;
  const chart = scores && now !== null ? [now, ...scores] : null;
  const final = chart ? chart[chart.length - 1] : null;

  const addTitles = (key: string, titles: string[], msg: string) =>
    run(key, async () => { for (const t of titles) await addMilestone(d.profile.id, t); }, msg);

  return (<>
    <PageTitle title="Skill gap roadmap">
      Your future self, simulated. CareerTwin takes the skills you are missing, plans them week by week, and recalculates your real skill coverage score after each week.
    </PageTitle>

    {cov === undefined || cov.score === null ? (
      <p className="mt-6 rounded-xl border border-line bg-panel p-4 text-slate-300" role="status">
        {cov?.reason ?? "Add your skills and a target role on the Profile page to build a roadmap."}
      </p>
    ) : sorted.length === 0 ? (
      <p className="mt-6 rounded-xl border border-line bg-panel p-4 text-slate-300" role="status">
        No skill gaps found for {d.profile.target_role}. Nice work. Next, link your skills to projects on the Projects page.
      </p>
    ) : (<>
      <section aria-label="Projected skill coverage" className="mt-6 rounded-xl border border-line bg-panel p-5">
        {chart && final !== null && now !== null ? (<>
          <p className="text-slate-300">If you follow this plan</p>
          <p className="mt-1 text-4xl font-bold tabular-nums">{now}% <span className="text-accent">→ {final}%</span></p>
          <p className="text-sm text-slate-400">skill coverage for {d.profile.target_role} in about {weeks.length} week{weeks.length > 1 ? "s" : ""}</p>
          <div className="mt-4"><Climb points={chart} /></div>
        </>) : projErr ? (
          <p className="text-slate-300" role="status">The projection needs the newest backend. Restart it with start_backend.bat, then reload this page.</p>
        ) : (
          <p className="text-slate-300" role="status">Simulating your future…</p>
        )}
      </section>

      <section aria-label="Pace" className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-slate-300">Pace:</span>
        {[1, 2, 3].map((n) => (
          <button key={n} onClick={() => setPace(n)} aria-pressed={pace === n}
            className={`rounded-lg border px-4 py-2 ${pace === n ? "border-accent bg-accent/20 text-white" : "border-line bg-panel text-slate-300 hover:border-accent"}`}>
            {n} skill{n > 1 ? "s" : ""} per week</button>))}
        <span className="text-sm text-slate-400">{sorted.length} gaps to close</span>
      </section>

      <ol className="mt-6 space-y-4">
        {weeks.map((w, i) => {
          const title = planned[i];
          const added = isAdded(title);
          const after = chart ? chart[i + 1] : null;
          const before = chart ? chart[i] : null;
          return (
            <li key={title} className="rounded-xl border border-line bg-panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Week {i + 1}
                  {after !== null && before !== null && (
                    <span className="ml-3 rounded bg-accent/20 px-2 py-0.5 text-sm font-medium tabular-nums text-white">
                      {before}% → {after}%{after > before && ` (+${after - before})`}</span>)}</h2>
                <button disabled={off || added} onClick={() => addTitles("roadmap-" + (i + 1), [title], "Added to your milestones.")}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-slate-300 hover:border-accent disabled:opacity-60">
                  {added ? "In your milestones" : busy === "roadmap-" + (i + 1) ? "Adding…" : "Add to milestones"}</button>
              </div>
              {w.map((g) => (
                <div key={g.skill} className="mt-4">
                  <p className="font-medium">{g.skill}
                    {g.level && <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-xs text-slate-300">{g.level}</span>}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                    <li>Days 1-2: learn the basics of {g.skill} from one beginner course or the official docs.</li>
                    <li>Days 3-4: do small exercises until you can use {g.skill} without copying.</li>
                    <li>Days 5-7: use {g.skill} in a real project, then tag it on the Projects page.</li>
                  </ul>
                </div>))}
            </li>);
        })}
      </ol>

      <button disabled={off || toAdd.length === 0} className={`${primaryBtn} mt-6`}
        onClick={() => addTitles("roadmap-all", toAdd, "Roadmap added to your milestones.")}>
        {busy === "roadmap-all" ? "Adding…" : toAdd.length === 0 ? "Whole roadmap is in your milestones" : `Add ${toAdd.length} week${toAdd.length > 1 ? "s" : ""} to my milestones`}</button>
      <p className="mt-3 text-xs text-slate-400">
        Projected scores use the same skill coverage formula as your dashboard, assuming you learn each skill that week. It is a simulation, not a promise of results.
      </p>
    </>)}
  </>);
}