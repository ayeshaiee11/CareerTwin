import { useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import { Alert, Field, inputCls, primaryBtn, ghostBtn } from "./ui";

type Mode = "login" | "signup";

export type AuthPageProps = {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (name: string, email: string, password: string) => Promise<void>;
  /** Optional: shows a "Try the demo" button that skips sign-in. */
  onDemo?: () => void;
  /** Which tab opens first. Use "signup" when coming from "Create my profile". */
  initialMode?: Mode;
  /** Optional: shows a "Back" link, e.g. to return to the landing page. */
  onBack?: () => void;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 0 to 4. One point each for length, mixed case, a digit, and a symbol. */
function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return pw.length < 8 ? Math.min(s, 1) : s;
}
const STRENGTH_LABEL = ["Too short", "Weak", "Okay", "Good", "Strong"];
const STRENGTH_COLOR = ["bg-white/15", "bg-rose-400", "bg-amber-400", "bg-sky-400", "bg-gold"];

/** Icon sits inside the input, on the left. */
function Icon({ children }: { children: ReactNode }) {
  return <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">{children}</span>;
}

/** The sign-in screen's one showpiece: skill towers that grow in and then breathe. */
function Towers() {
  const bars = [
    { glass: 62, solid: 38 }, { glass: 88, solid: 70 }, { glass: 46, solid: 20 },
    { glass: 100, solid: 84 }, { glass: 72, solid: 52 }, { glass: 54, solid: 30 },
  ];
  return (
    <div className="relative mt-10 flex h-56 items-end gap-3.5" aria-hidden>
      <div className="absolute inset-x-0 bottom-0 h-px bg-line" />
      <div className="absolute -bottom-6 left-1/2 h-24 w-4/5 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl" />
      {bars.map((b, i) => (
        <div key={i} className="auth-tower relative w-12 flex-1 max-w-14" style={{ height: `${b.glass}%`, animationDelay: `${i * 120}ms` }}>
          <div className="absolute inset-0 rounded-t-md border border-accent/60 bg-accent/10" />
          <div className="absolute inset-x-[19%] bottom-0 rounded-t-sm bg-gold shadow-[0_0_24px_-2px_rgb(52_211_153_/_0.6)]"
            style={{ height: `${(b.solid / b.glass) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width="34" height="22" viewBox="0 0 34 22" fill="none" aria-hidden>
        <circle cx="11" cy="11" r="9" stroke="#4f8cff" strokeWidth="2.5" />
        <circle cx="23" cy="11" r="9" stroke="#34d399" strokeWidth="2.5" />
      </svg>
      <span className="font-display text-xl font-bold">CareerTwin</span>
    </div>
  );
}

export function AuthPage({ onLogin, onSignup, onDemo, initialMode = "login", onBack }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  const signup = mode === "signup";
  const score = strength(password);

  const switchMode = (m: Mode) => { setMode(m); setError(null); setFieldErr({}); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (signup && !name.trim()) errs.name = "Enter your name.";
    if (!EMAIL.test(email.trim())) errs.email = "Enter a valid email address, like name@example.com.";
    if (!password) errs.password = "Enter your password.";
    else if (signup && password.length < 8) errs.password = "Use at least 8 characters.";
    setFieldErr(errs);
    if (Object.keys(errs).length) return;

    setBusy(true); setError(null);
    try {
      if (signup) await onSignup(name.trim(), email.trim(), password);
      else await onLogin(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <style>{`
        @keyframes auth-grow { from { transform: scaleY(0); } }
        @keyframes auth-breathe { 50% { transform: scaleY(0.94); } }
        .auth-tower { transform-origin: bottom; animation: auth-grow 1.1s cubic-bezier(.2,.8,.2,1) both, auth-breathe 6s ease-in-out 1.4s infinite; }
        @media (prefers-reduced-motion: reduce) { .auth-tower { animation: none; } }
      `}</style>

      {/* brand side */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-12 lg:flex">
        <Logo />
        <div className="max-w-lg">
          <h1 className="font-display text-5xl font-extrabold leading-[1.05] xl:text-6xl">
            See how ready you are for the role you want.
          </h1>
          <p className="mt-5 max-w-md text-lg text-slate-300">
            Add your skills, match your resume to a job, and prove what you know with real projects.
          </p>
          <Towers />
          <p className="mt-9 flex items-center gap-5 text-sm text-slate-400">
            <span className="inline-flex items-center gap-2"><i className="inline-block size-3 rounded-sm border border-accent/70 bg-accent/10" /> Skills you list</span>
            <span className="inline-flex items-center gap-2"><i className="inline-block size-3 rounded-sm bg-gold" /> Skills you have proven</span>
          </p>
        </div>
        <p className="text-sm text-slate-500">Your data stays on your account. Delete it any time in Settings and privacy.</p>
      </aside>

      {/* form side */}
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Logo className="mb-6 lg:hidden" />
          {onBack && <button type="button" onClick={onBack} className="mb-6 text-sm text-slate-400 hover:text-slate-100">&larr; Back to home</button>}

          {/* sliding segmented switch */}
          <div role="tablist" aria-label="Sign in or create account" className="relative mb-8 grid grid-cols-2 rounded-xl border border-line bg-panel p-1">
            <span aria-hidden className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-accent/20 ring-1 ring-accent/50 transition-transform duration-300 ease-out"
              style={{ transform: signup ? "translateX(100%)" : "translateX(0)" }} />
            {(["login", "signup"] as Mode[]).map((m) => (
              <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => switchMode(m)}
                className={`relative z-10 rounded-lg py-2 text-sm font-semibold transition-colors ${mode === m ? "text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <h2 className="font-display text-3xl font-bold">{signup ? "Create your account" : "Welcome back"}</h2>
          <p className="mt-1.5 text-slate-400">{signup ? "It takes under a minute. No card needed." : "Sign in to pick up where you left off."}</p>

          <form onSubmit={submit} noValidate className="mt-7 space-y-5">
            {signup && (
              <Field id="auth-name" label="Full name">
                <div className="relative">
                  <Icon><User size={17} aria-hidden /></Icon>
                  <input id="auth-name" className={`${inputCls} pl-10!`} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
                    aria-invalid={!!fieldErr.name} aria-describedby={fieldErr.name ? "auth-name-err" : undefined} disabled={busy} />
                </div>
                {fieldErr.name && <p id="auth-name-err" className="mt-1.5 text-sm text-rose-300">{fieldErr.name}</p>}
              </Field>
            )}

            <Field id="auth-email" label="Email">
              <div className="relative">
                <Icon><Mail size={17} aria-hidden /></Icon>
                <input id="auth-email" type="email" inputMode="email" className={`${inputCls} pl-10!`} autoComplete="email" placeholder="name@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!fieldErr.email} aria-describedby={fieldErr.email ? "auth-email-err" : undefined} disabled={busy} />
              </div>
              {fieldErr.email && <p id="auth-email-err" className="mt-1.5 text-sm text-rose-300">{fieldErr.email}</p>}
            </Field>

            <Field id="auth-password" label="Password">
              <div className="relative">
                <Icon><Lock size={17} aria-hidden /></Icon>
                <input id="auth-password" type={show ? "text" : "password"} className={`${inputCls} pl-10! pr-11!`}
                  autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!fieldErr.password} aria-describedby={fieldErr.password ? "auth-pw-err" : undefined} disabled={busy} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
                  className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-100">
                  {show ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
                </button>
              </div>
              {fieldErr.password && <p id="auth-pw-err" className="mt-1.5 text-sm text-rose-300">{fieldErr.password}</p>}
              {signup && password && (
                <div className="mt-2.5" aria-live="polite">
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4].map((n) => (
                      <i key={n} className={`h-1.5 rounded-full transition-colors duration-300 ${score >= n ? STRENGTH_COLOR[score] : "bg-white/10"}`} />
                    ))}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-400">Strength: {STRENGTH_LABEL[score]}</p>
                </div>
              )}
            </Field>

            {error && <Alert>{error}</Alert>}

            <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>
              {busy && <Loader2 size={18} className="animate-spin" aria-hidden />}
              {busy ? (signup ? "Creating account" : "Signing in") : signup ? "Create account" : "Sign in"}
            </button>
          </form>

          {onDemo && (
            <>
              <div className="my-6 flex items-center gap-4 text-sm text-slate-500" role="separator">
                <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
              </div>
              <button type="button" onClick={onDemo} disabled={busy} className={`${ghostBtn} w-full`}>
                Explore with demo data
              </button>
            </>
          )}

          <p className="mt-8 text-center text-sm text-slate-400">
            {signup ? "Already have an account?" : "New to CareerTwin?"}{" "}
            <button type="button" onClick={() => switchMode(signup ? "login" : "signup")} className="font-semibold text-accent underline-offset-4 hover:underline">
              {signup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}