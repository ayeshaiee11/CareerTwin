export type Evidence = { score: number | null; reason?: string; evidence?: any };
export type Project = { id: number; title: string; url: string; description: string; skills: string[] };
export type Question = { id: string; category: string; text: string };
export type Practice = { question_id: string; answer: string; rating: number };
export type ProfileValues = { name: string; education: string; target_role: string; skills: string[] };
export type Dashboard = {
  profile: ProfileValues & { id: number; is_demo: boolean };
  indicators: Record<string, Evidence>;
  milestones: { id: number; title: string; done: boolean }[];
  projects: Project[];
  resume: { resume_text: string; job_description: string } | null;
  practice: Practice[];
  questions: Question[];
  note: string;
};

/** Error with the HTTP status attached, so callers can react to a 404 differently from an outage. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const OFFLINE = "Cannot reach the API. Start the backend: uvicorn app.main:app --port 8000";

/** Reads our {error} envelope first, then FastAPI's default {detail} (string or validation list). */
function messageFrom(body: any): string | undefined {
  if (typeof body?.error === "string") return body.error;
  const d = body?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    const msgs = d.map((x) => x?.msg).filter(Boolean);
    return msgs.length ? `Please check your input: ${msgs.join("; ")}` : undefined;
  }
  return undefined;
}

async function call<T>(url: string, method = "GET", payload?: unknown, timeoutMs = 10_000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method, signal: ctl.signal,
      ...(payload !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    });
  } catch (e) {
    throw new ApiError((e as Error).name === "AbortError" ? "The API took too long to respond. Try again." : OFFLINE);
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Vite's dev proxy answers 5xx with an empty body when the backend is not running.
    if (!body && res.status >= 500) throw new ApiError(OFFLINE, res.status);
    throw new ApiError(messageFrom(body) ?? "Unexpected server error.", res.status);
  }
  if (!body) throw new ApiError("Unexpected server error.", res.status);
  return body.data as T;
}

export const startDemo = () => call<{ id: number }>("/api/profiles/demo", "POST");
export const createProfile = (v: ProfileValues) => call<{ id: number }>("/api/profiles", "POST", v);
export const updateProfile = (id: number, v: ProfileValues) => call<{ id: number }>(`/api/profiles/${id}`, "PUT", v);
export const getDashboard = (id: number) => call<Dashboard>(`/api/dashboard/${id}`);
export const deleteProfile = (id: number) => call<{ deleted: boolean }>(`/api/profiles/${id}`, "DELETE");

export const addMilestone = (profileId: number, title: string) =>
  call<{ id: number; title: string; done: boolean }>(`/api/profiles/${profileId}/milestones`, "POST", { title });
export const toggleMilestone = (id: number) => call<{ id: number; done: boolean }>(`/api/milestones/${id}`, "PATCH");
export const deleteMilestone = (id: number) => call<{ deleted: boolean }>(`/api/milestones/${id}`, "DELETE");

export const saveResume = (profileId: number, v: { resume_text: string; job_description: string }) =>
  call<{ saved: boolean }>(`/api/profiles/${profileId}/resume`, "PUT", v);
export const clearResume = (profileId: number) => call<{ deleted: boolean }>(`/api/profiles/${profileId}/resume`, "DELETE");

export const addProject = (profileId: number, v: Omit<Project, "id">) =>
  call<{ id: number }>(`/api/profiles/${profileId}/projects`, "POST", v);
export const deleteProject = (id: number) => call<{ deleted: boolean }>(`/api/projects/${id}`, "DELETE");

export const savePractice = (profileId: number, qid: string, v: { answer: string; rating: number }) =>
  call<{ question_id: string; rating: number }>(`/api/profiles/${profileId}/practice/${qid}`, "PUT", v);

export const getProjection = (profileId: number, steps: string[][]) =>
  call<{ scores: (number | null)[] }>(`/api/profiles/${profileId}/projection`, "POST", { steps });