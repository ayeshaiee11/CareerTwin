import { useState } from "react";
import { Trash2 } from "lucide-react";
import { addProject, deleteProject, type Evidence } from "./api";
import { Field, inputCls, list, PageTitle, primaryBtn, type PageProps } from "./ui";

const NO_DATA: Evidence = { score: null, reason: "Not enough data yet." };

export function ProjectsPage({ d, run, busy }: PageProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");
  const [skills, setSkills] = useState("");
  const ind = d.indicators?.project_evidence ?? NO_DATA;
  const projects = d.projects ?? [];
  const off = busy !== null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run("project-add", () => addProject(d.profile.id, {
      title: title.trim(), url: url.trim(), description: desc.trim(),
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
    }), "Project added.");
    if (ok) { setTitle(""); setUrl(""); setDesc(""); setSkills(""); }
  };

  return (<>
    <PageTitle title="Projects">
      Add the projects you have built and tag the skills each one uses. Project evidence is the share of your profile skills that you have linked to at least one project.
    </PageTitle>
    <section aria-label="Your projects" className="mt-6">
      {projects.length === 0 && <p className="text-slate-400">No projects yet. Add your first one below.</p>}
      <ul className="space-y-3">
        {projects.map((p) => {
          const sk = p.skills ?? [];
          return (
            <li key={p.id} className="flex gap-2">
              <div className="min-w-0 flex-1 rounded-lg border border-line bg-panel p-4">
                <h2 className="font-semibold break-words">{p.title}</h2>
                {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline break-all">{p.url}</a>}
                {p.description && <p className="mt-2 text-sm text-slate-300 break-words">{p.description}</p>}
                {sk.length > 0 && <p className="mt-2 flex flex-wrap gap-1.5">{sk.map((s) => <span key={s} className="rounded bg-white/10 px-2 py-0.5 text-xs">{s}</span>)}</p>}
              </div>
              <button disabled={off} onClick={() => run("project-" + p.id, () => deleteProject(p.id), "Project deleted.")} aria-label={`Delete project: ${p.title}`}
                className="self-start rounded-lg border border-line bg-panel p-3 text-slate-400 hover:border-red-400/50 hover:text-red-200 disabled:opacity-60"><Trash2 size={16} aria-hidden /></button>
            </li>);
        })}
      </ul>
    </section>
    <form onSubmit={submit} className="mt-8 max-w-xl space-y-5">
      <h2 className="text-xl font-semibold">Add a project</h2>
      <Field id="pj-title" label="Title"><input id="pj-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required disabled={off} /></Field>
      <Field id="pj-url" label="Link" hint="Optional. Must start with http:// or https://."><input id="pj-url" aria-describedby="pj-url-hint" type="url" className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} maxLength={200} disabled={off} /></Field>
      <Field id="pj-desc" label="What it does" hint="Up to 500 characters. Skills named here are picked up too."><textarea id="pj-desc" aria-describedby="pj-desc-hint" className={inputCls} rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} disabled={off} /></Field>
      <Field id="pj-skills" label="Skills used" hint="Separate with commas."><input id="pj-skills" aria-describedby="pj-skills-hint" className={inputCls} value={skills} onChange={(e) => setSkills(e.target.value)} disabled={off} /></Field>
      <button type="submit" disabled={off || !title.trim()} className={primaryBtn}>{busy === "project-add" ? "Adding…" : "Add project"}</button>
    </form>
    <section aria-label="Result" className="mt-8 rounded-xl border border-line bg-panel p-5">
      <h2 className="text-xl font-semibold">Project evidence</h2>
      {ind.score === null ? <p className="mt-2 text-slate-300">{ind.reason}</p> : (<>
        <p className="mt-2 text-3xl font-bold tabular-nums">{ind.score}%</p>
        <p className="mt-3 text-sm text-slate-300"><b>Shown in a project:</b> {list(ind.evidence?.shown?.map((s: { skill: string }) => s.skill))}</p>
        <p className="mt-1 text-sm text-slate-300"><b>Not shown in any project yet:</b> {list(ind.evidence?.not_shown)}</p>
        <p className="mt-3 text-sm text-slate-400">How it's calculated: {ind.evidence?.formula}</p>
      </>)}
    </section>
  </>);
}