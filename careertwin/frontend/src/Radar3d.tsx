import { useEffect, useReducer, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

export type Area = { name: string; claimed: number; backed: number };

const W = 720, H = 400, CX = 360, CY = 250;
const RING = 125, TILT = 0.5, MAXH = 135, HALF = 19, START = 0.5;
const GOLD = "#34d399", ROSE = "#4f8cff"; // mint = proven, blue = listed
const TAU = Math.PI * 2;
const frac = (n: number) => Math.min(1, n / 4); // 4 or more skills fills a tower
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

// fixed "dust motes" that drift upward through the scene (seeded, so no re-randomising)
const MOTES = Array.from({ length: 30 }, (_, i) => {
  const r = (k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
  return { a: r(1) * TAU, d: Math.sqrt(r(2)) * RING * 1.4, h: r(3), v: 0.012 + r(4) * 0.02, s: 0.7 + r(5) * 1.3 };
});
const MOTE_RANGE = MAXH * 1.7;

type V3 = readonly [number, number, number];
type Face = { n: V3; v: V3[]; top?: boolean };

function boxFaces(cx: number, cz: number, s: number, h: number): Face[] {
  const c = (dx: number, dz: number, y: number): V3 => [cx + dx * s, y, cz + dz * s];
  return [
    { n: [0, 1, 0], top: true, v: [c(-1, -1, h), c(1, -1, h), c(1, 1, h), c(-1, 1, h)] },
    { n: [0, 0, 1], v: [c(-1, 1, 0), c(1, 1, 0), c(1, 1, h), c(-1, 1, h)] },
    { n: [0, 0, -1], v: [c(1, -1, 0), c(-1, -1, 0), c(-1, -1, h), c(1, -1, h)] },
    { n: [1, 0, 0], v: [c(1, 1, 0), c(1, -1, 0), c(1, -1, h), c(1, 1, h)] },
    { n: [-1, 0, 0], v: [c(-1, -1, 0), c(-1, 1, 0), c(-1, 1, h), c(-1, -1, h)] },
  ];
}

export function Radar3D({ areas }: { areas: Area[] }) {
  const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [auto, setAuto] = useState(!reduce);
  const [active, setActive] = useState<number | null>(null);
  const drag = useRef<number | null>(null);
  const st = useRef({ theta: START, vel: 0, grow: reduce ? 1 : 0, sweep: 0, now: 0 });
  const [, paint] = useReducer((x: number) => x + 1, 0);

  // one animation loop: grow-in, spin + drag inertia, radar sweep, drifting motes
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(50, t - last); last = t;
      const s = st.current; let dirty = false;
      if (s.grow < 1) { s.grow = Math.min(1, s.grow + dt / 1800); dirty = true; }
      if (drag.current === null) {
        const spin = (auto ? 0.0004 * dt : 0) + s.vel;
        if (spin) { s.theta += spin; dirty = true; }
        s.vel *= 0.94; if (Math.abs(s.vel) < 1e-5) s.vel = 0;
      }
      if (!reduce) { s.sweep += dt * 0.0011; s.now += dt; dirty = true; }
      if (dirty) paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto, reduce]);

  const s = st.current;
  const cT = Math.cos(s.theta), sT = Math.sin(s.theta), cP = Math.cos(TILT), sP = Math.sin(TILT);
  const rot = (x: number, y: number, z: number) => {
    const x1 = x * cT + z * sT, z1 = -x * sT + z * cT;
    return { x: x1, y: y * cP - z1 * sP, z: y * sP + z1 * cP };
  };
  const scr = (p: V3) => { const r = rot(p[0], p[1], p[2]); return { sx: CX + r.x, sy: CY - r.y, z: r.z }; };
  const pts = (vs: V3[]) => vs.map((p) => { const q = scr(p); return `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`; }).join(" ");

  const n = Math.max(1, areas.length);
  const place = (i: number, radius: number): V3 => {
    const a = (i * TAU) / n;
    return [radius * Math.sin(a), 0, -radius * Math.cos(a)];
  };
  const polar = (a: number, radius: number): V3 => [radius * Math.sin(a), 0, -radius * Math.cos(a)];

  const rings = [0.25, 0.5, 0.75, 1].map((g) => Array.from({ length: n }, (_, i) => place(i, RING * g * 1.15)));
  const towers = areas.map((a, i) => {
    const [bx, , bz] = place(i, RING);
    const lag = ((s.sweep - (i * TAU) / n) % TAU + TAU) % TAU; // how long ago the sweep passed this tower
    const boost = reduce ? 0 : lag < 1.1 ? 1 - lag / 1.1 : 0;
    return { a, i, bx, bz, boost, depth: scr([bx, 40, bz]).z };
  }).sort((p, q) => p.depth - q.depth); // far towers first

  const drawBox = (faces: Face[], solid: boolean, key: string, color: string, boost: number, fade: number, hot: boolean) =>
    faces.map((f, k) => {
      const rn = rot(f.n[0], f.n[1], f.n[2]);
      if (rn.z <= 0.001) return null; // face points away from the viewer
      const shade = f.top ? 1 : 0.45 + 0.4 * ((rn.x + 1) / 2);
      const base = solid ? 0.35 + 0.65 * shade + boost * 0.25 : 0.1 + 0.14 * shade + boost * 0.12;
      return <polygon key={`${key}-${k}`} points={pts(f.v)} fill={color}
        fillOpacity={Math.min(1, base) * fade}
        stroke={color} strokeOpacity={(solid ? 0.9 : 0.55 + (hot ? 0.4 : 0)) * fade} strokeWidth={solid ? 1 : hot ? 2 : 1.5} strokeLinejoin="round" />;
    });

  // sweep wedge: a few stacked slices fake a fading trail
  const wedge = (span: number) => {
    const arc = Array.from({ length: 11 }, (_, k) => polar(s.sweep - span + (span * k) / 10, RING * 1.15));
    return pts([[0, 0, 0], ...arc]);
  };

  const summary = areas.map((a) => `${a.name}: ${a.claimed} listed, ${a.backed} proven`).join("; ");
  const totC = areas.reduce((t, a) => t + a.claimed, 0), totB = areas.reduce((t, a) => t + a.backed, 0);
  const cur = active !== null ? areas[active] : null;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-auto w-full max-w-3xl cursor-grab select-none text-slate-400 active:cursor-grabbing"
        style={{ touchAction: "pan-y" }} role="img" aria-label={`3D skill towers. ${summary}`}
        onPointerDown={(e) => { drag.current = e.clientX; st.current.vel = 0; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (drag.current === null) return;
          const dx = (e.clientX - drag.current) * 0.01;
          st.current.theta += dx; st.current.vel = dx; drag.current = e.clientX; paint();
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onPointerLeave={() => setActive(null)}>
        <defs>
          <radialGradient id="r3d-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={ROSE} stopOpacity="0.3" /><stop offset="60%" stopColor="#22d3ee" stopOpacity="0.1" /><stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* glowing floor + rings + spokes */}
        <ellipse cx={CX} cy={CY} rx={RING * 1.7} ry={RING * 1.7 * Math.sin(TILT)} fill="url(#r3d-glow)" />
        {rings.map((r, k) => <polygon key={k} points={pts(r)} fill="none" stroke="currentColor" strokeOpacity={0.22} />)}
        {areas.map((_, i) => <polyline key={i} points={pts([[0, 0, 0], place(i, RING * 1.15)])} fill="none" stroke="currentColor" strokeOpacity={0.15} />)}

        {/* radar sweep */}
        {!reduce && <g>
          {[1.1, 0.8, 0.5, 0.25].map((sp) => <polygon key={sp} points={wedge(sp)} fill={GOLD} fillOpacity={0.045} />)}
          <polyline points={pts([[0, 0, 0], polar(s.sweep, RING * 1.15)])} fill="none" stroke={GOLD} strokeOpacity={0.6} strokeWidth={1.2} />
        </g>}

        {/* drifting motes */}
        {!reduce && MOTES.map((m, k) => {
          const y = (m.h * MOTE_RANGE + s.now * m.v) % MOTE_RANGE;
          const q = scr(polar(m.a, m.d).map((v, j) => (j === 1 ? y : v)) as unknown as V3);
          return <circle key={k} cx={q.sx} cy={q.sy} r={m.s} fill={GOLD} fillOpacity={Math.sin((Math.PI * y) / MOTE_RANGE) * 0.6} />;
        })}

        {/* towers: solid gold = proven in a project, rose glass = skills you list */}
        {towers.map(({ a, i, bx, bz, boost }) => {
          const gi = ease(s.grow * 1.6 - i * 0.15);
          const hClaimed = Math.max(3, MAXH * frac(a.claimed)) * gi;
          const hBacked = Math.max(3, MAXH * frac(a.backed)) * gi;
          const hot = active === i;
          const fade = active === null || hot ? 1 : 0.35;
          const base = scr([bx, 0, bz]);
          return (
            <g key={a.name} onPointerEnter={() => setActive(i)} onClick={() => setActive((v) => (v === i ? null : i))} className="cursor-pointer">
              <ellipse cx={base.sx} cy={base.sy} rx={HALF * 2} ry={HALF * 2 * Math.sin(TILT)} fill={GOLD}
                fillOpacity={(0.1 + boost * 0.3 + (hot ? 0.2 : 0)) * fade} />
              {drawBox(boxFaces(bx, bz, HALF * 0.62, hBacked), true, `s${i}`, GOLD, boost, fade, hot)}
              {drawBox(boxFaces(bx, bz, HALF, hClaimed), false, `g${i}`, ROSE, boost, fade, hot)}
            </g>
          );
        })}

        {/* labels last so they stay readable */}
        {areas.map((a, i) => {
          const q = scr(place(i, RING * 1.62));
          const anchor = q.sx > CX + 25 ? "start" : q.sx < CX - 25 ? "end" : "middle";
          const hot = active === i;
          return (
            <text key={a.name} x={q.sx} y={q.sy} textAnchor={anchor} fontSize="14" fontWeight="600" fill={hot ? GOLD : "white"}
              fillOpacity={active === null || hot ? 1 : 0.45} stroke="#0a0f16" strokeWidth="4" paintOrder="stroke" strokeLinejoin="round" pointerEvents="none">
              {a.name}
              <tspan x={q.sx} dy="16" fontSize="12" fontWeight="400" fill="#cbd5e1">{a.claimed} listed · {a.backed} proven</tspan>
            </text>);
        })}
      </svg>

      {/* readout: changes with the hovered tower */}
      <div className="mx-auto mt-1 flex min-h-14 max-w-3xl flex-col items-center justify-center gap-1.5 text-center text-sm" aria-live="polite">
        {cur ? (<>
          <p className="text-slate-200"><span className="font-display text-base font-bold text-gold">{cur.name}</span>{" "}
            {cur.claimed === 0 ? "has no skills listed yet." : `${cur.backed} of ${cur.claimed} listed skills are proven in a project.`}</p>
          <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${cur.claimed ? Math.min(100, (cur.backed / cur.claimed) * 100) : 0}%` }} />
          </div>
        </>) : (
          <p className="text-slate-400">{totC} listed, {totB} proven. Hover a tower for detail.</p>
        )}
      </div>

      <div className="print:hidden mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-400">
        <span className="mr-1 inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-gold" /> proven</span>
        <span className="mr-2 inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm border border-accent bg-accent/20" /> listed</span>
        <span>Drag to rotate</span>
        <button onClick={() => setAuto((v) => !v)} aria-pressed={auto}
          className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-slate-200 hover:border-accent">
          {auto ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}{auto ? "Pause spin" : "Auto spin"}</button>
        <button onClick={() => { st.current.theta = START; st.current.vel = 0; paint(); }} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-slate-200 hover:border-accent">
          <RotateCcw size={14} aria-hidden /> Reset view</button>
      </div>
    </div>
  );
}