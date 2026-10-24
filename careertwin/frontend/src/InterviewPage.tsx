import { useState } from "react";
import { savePractice, type Evidence, type Practice, type Question } from "./api";
import { Field, inputCls, PageTitle, primaryBtn, type PageProps } from "./ui";

const NO_DATA: Evidence = { score: null, reason: "Not enough data yet." };

function QuestionCard({ q, saved, pid, run, busy }: { q: Question; saved?: Practice; pid: number } & Pick<PageProps, "run" | "busy">) {
  const [answer, setAnswer] = useState(saved?.answer ?? "");
  const [rating, setRating] = useState(saved ? String(saved.rating) : "");
  const key = "q-" + q.id;
  return (
    <details className="p-4">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{q.text}</span>
        <span className={`text-sm ${saved ? "text-accent" : "text-slate-400"}`}>{saved ? `Rated ${saved.rating} of 5` : "Not practiced"}</span>
      </summary>
      <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); run(key, () => savePractice(pid, q.id, { answer: answer.trim(), rating: Number(rating) }), "Answer saved."); }}>
        <Field id={`${key}-a`} label="Your answer" hint="Optional. Writing it out helps you spot gaps. It is stored only on this machine.">
          <textarea id={`${key}-a`} aria-describedby={`${key}-a-hint`} className={inputCls} rows={5} maxLength={2000} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={busy !== null} />
        </Field>
        <Field id={`${key}-r`} label="How good was your answer?">
          <select id={`${key}-r`} className={inputCls} value={rating} onChange={(e) => setRating(e.target.value)} disabled={busy !== null}>
            <option value="">Choose a rating</option>
            <option value="1">1 - Not ready</option><option value="2">2 - Weak</option><option value="3">3 - Okay</option>
            <option value="4">4 - Good</option><option value="5">5 - Confident</option>
          </select>
        </Field>
        <button type="submit" disabled={busy !== null || !rating} className={primaryBtn}>{busy === key ? "Saving…" : "Save answer"}</button>
      </form>
    </details>
  );
}

export function InterviewPage({ d, run, busy }: PageProps) {
  const ind = d.indicators?.interview_prep ?? NO_DATA;
  const practice = d.practice ?? [];
  const questions = d.questions ?? [];
  const byId = new Map(practice.map((p) => [p.question_id, p]));
  const cats = [...new Set(questions.map((q) => q.category))];
  return (<>
    <PageTitle title="Interview practice">
      Open a question, write your answer, then rate it honestly. The score counts the questions you rate 4 or 5.
    </PageTitle>
    <p className="mt-4 rounded-xl border border-line bg-panel p-4 text-slate-300" role="status">
      {ind.score === null ? ind.reason : `${ind.evidence?.confident} of ${ind.evidence?.total} questions rated 4 or 5 (${ind.score}%). ${ind.evidence?.practiced} practiced so far. Self-assessed, so it shows how ready you feel, not how an interviewer would score you.`}
    </p>
    {questions.length === 0 && (
      <p className="mt-6 text-slate-400">No questions were received from the server. Restart the backend and reload this page.</p>
    )}
    {cats.map((c) => (
      <section key={c} aria-label={c} className="mt-8">
        <h2 className="text-xl font-semibold">{c}</h2>
        <div className="mt-3 divide-y divide-line rounded-xl border border-line bg-panel">
          {questions.filter((q) => q.category === c).map((q) => (
            <QuestionCard key={q.id} q={q} saved={byId.get(q.id)} pid={d.profile.id} run={run} busy={busy} />))}
        </div>
      </section>))}
  </>);
}