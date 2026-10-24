import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { clearResume, saveResume, type Evidence } from "./api";
import { extractText, MAX_CHARS, MAX_FILE_MB } from "./extractText";
import { Field, ghostBtn, inputCls, list, PageTitle, primaryBtn, type PageProps } from "./ui";

const NO_DATA: Evidence = { score: null, reason: "Not enough data yet." };

/** Choose or drop a PDF / Word / text file; its text is handed to onText. */
function FileDrop({ id, what, onText, disabled }: { id: string; what: string; onText: (t: string) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState("");
  const [bad, setBad] = useState(false);

  const handle = async (file?: File) => {
    if (!file) return;
    setMsg(""); setBad(false); setReading(true);
    try { const r = await extractText(file); onText(r.text); setMsg(`${file.name}: ${r.note} Check the text below, then save.`); }
    catch (e) { setBad(true); setMsg((e as Error).message); }
    finally { setReading(false); if (input.current) input.current.value = ""; }
  };

  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled && !reading) handle(e.dataTransfer.files[0]); }}
      className={`mt-2 rounded-lg border border-dashed p-3 ${over ? "border-accent bg-accent/10" : "border-line"}`}>
      <input ref={input} id={id} type="file" accept=".pdf,.docx,.txt,.md" className="sr-only" tabIndex={-1}
        onChange={(e) => handle(e.target.files?.[0])} disabled={disabled || reading} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => input.current?.click()} disabled={disabled || reading} className={`${ghostBtn} flex items-center gap-2`}>
          <FileUp size={16} aria-hidden /> {reading ? "Reading file…" : `Upload ${what}`}</button>
        <span className="text-sm text-slate-400">or drop a PDF or Word (.docx) file here. Up to {MAX_FILE_MB} MB.</span>
      </div>
      {msg && <p role={bad ? "alert" : "status"} className={`mt-2 text-sm ${bad ? "text-red-300" : "text-slate-300"}`}>{msg}</p>}
    </div>
  );
}

export function ResumePage({ d, run, busy }: PageProps) {
  const [resume, setResume] = useState(d.resume?.resume_text ?? "");
  const [jd, setJd] = useState(d.resume?.job_description ?? "");
  const off = busy !== null;
  const ind = d.indicators?.resume_alignment ?? NO_DATA;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run("resume-save", () => saveResume(d.profile.id, { resume_text: resume, job_description: jd }), "Saved.");
  };
  const clear = async () => {
    if (!confirm("Remove your saved resume and job description?")) return;
    if (await run("resume-clear", () => clearResume(d.profile.id), "Resume and job description removed.")) { setResume(""); setJd(""); }
  };

  return (<>
    <PageTitle title="Resume match">
      Upload or paste your resume and a job description. CareerTwin finds the technical skills named in the job description and checks which of them appear in your resume. Files are read in your browser. Only the text is saved, on this machine.
    </PageTitle>

    <form onSubmit={save} className="mt-6 max-w-3xl space-y-6">
      <Field id="rs-resume" label="Your resume (plain text)">
        <textarea id="rs-resume" className={inputCls} rows={12} maxLength={MAX_CHARS} value={resume} onChange={(e) => setResume(e.target.value)} disabled={off} />
      </Field>
      <p className="-mt-4 text-xs text-slate-400">{resume.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters</p>
      <FileDrop id="rs-resume-file" what="resume" onText={setResume} disabled={off} />

      <Field id="rs-jd" label="Job description" hint="Paste or upload the full posting so more skills can be recognised.">
        <textarea id="rs-jd" aria-describedby="rs-jd-hint" className={inputCls} rows={10} maxLength={MAX_CHARS} value={jd} onChange={(e) => setJd(e.target.value)} disabled={off} />
      </Field>
      <p className="-mt-4 text-xs text-slate-400">{jd.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters</p>
      <FileDrop id="rs-jd-file" what="job description" onText={setJd} disabled={off} />

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={off || (!resume.trim() && !jd.trim())} className={primaryBtn}>{busy === "resume-save" ? "Saving…" : "Save and compare"}</button>
        {d.resume && <button type="button" onClick={clear} disabled={off} className={ghostBtn}>Remove saved resume</button>}
      </div>
    </form>

    <section aria-label="Result" className="mt-8 max-w-3xl rounded-xl border border-line bg-panel p-5">
      <h2 className="text-xl font-semibold">Resume alignment</h2>
      {ind.score === null ? <p className="mt-2 text-slate-300">{ind.reason}</p> : (<>
        <p className="mt-2 text-3xl font-bold tabular-nums">{ind.score}%</p>
        <p className="mt-3 text-sm text-slate-300"><b>Found in your resume:</b> {list(ind.evidence?.matched)}</p>
        <p className="mt-1 text-sm text-slate-300"><b>Not found:</b> {list(ind.evidence?.missing)}</p>
        <p className="mt-3 text-sm text-slate-400">How it's calculated: {ind.evidence?.formula}</p>
        {ind.evidence?.note && <p className="mt-1 text-sm text-slate-400">{ind.evidence.note}</p>}
      </>)}
    </section>
  </>);
}