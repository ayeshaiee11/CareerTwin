import { createContext, useContext, useState, type ReactNode } from "react";
import { AuthPage } from "./AuthPage";

/**
 * Wraps your app: shows the sign in / sign up page until someone is signed in
 * (or opens the demo), then renders the app.
 *
 * IMPORTANT: accounts are stored in this browser's localStorage so the flow works
 * without a backend. That is fine for a portfolio demo, but it is NOT real security.
 * For real users, replace login() and signup() below with calls to your server.
 */

export type User = { name: string; email: string; demo?: boolean };
type Ctx = { user: User; logout: () => void };

const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth must be used inside <AuthGate>");
  return c;
};

const USERS = "careertwin.users";
const SESSION = "careertwin.session";

type Stored = Record<string, { name: string; hash: string }>;

const read = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

async function hash(email: string, password: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${email}:${password}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => read<User | null>(SESSION, null));

  async function signup(name: string, rawEmail: string, password: string) {
    const email = rawEmail.toLowerCase();
    const users = read<Stored>(USERS, {});
    if (users[email]) throw new Error("An account with this email already exists. Try signing in.");
    users[email] = { name, hash: await hash(email, password) };
    write(USERS, users);
    const u = { name, email };
    write(SESSION, u); setUser(u);
  }

  async function login(rawEmail: string, password: string) {
    const email = rawEmail.toLowerCase();
    const found = read<Stored>(USERS, {})[email];
    if (!found || found.hash !== (await hash(email, password))) throw new Error("Email or password is incorrect.");
    const u = { name: found.name, email };
    write(SESSION, u); setUser(u);
  }

  function logout() {
    try { localStorage.removeItem(SESSION); } catch { /* ignore */ }
    setUser(null);
  }

  if (!user) {
    const hasAccounts = Object.keys(read<Stored>(USERS, {})).length > 0;
    return (
      <AuthPage
        initialMode={hasAccounts ? "login" : "signup"}
        onLogin={login}
        onSignup={signup}
        onDemo={() => setUser({ name: "Aarav Rao (demo)", email: "demo@careertwin.app", demo: true })}
      />
    );
  }
  return <AuthCtx.Provider value={{ user, logout }}>{children}</AuthCtx.Provider>;
}