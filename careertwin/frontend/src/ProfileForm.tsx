import { useState } from "react";
import { X } from "lucide-react";
import type { ProfileValues } from "./api";
import { Field, inputCls, primaryBtn } from "./ui";

const SUGGESTED = ["Python", "SQL", "Pandas", "NumPy", "Scikit-learn", "Git", "PyTorch", "TensorFlow", "Statistics", "Docker"];
const MAX_SKILLS = 60;

type Props = {
  initial?: Partial<ProfileValues>;
  submitLabel: string;
  savingLabel: string;
  saving: boolean;
  disabled: boolean;
  onSubmit: (v: ProfileValues) => unknown;
};

export function ProfileForm({ initial, submitLabel, savingLabel, saving, disabled, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [education, setEducation] = useState(initial?.education ?? "");
  const [role, setRole] = useState(initial?.target_role ?? "ML Engineer Intern");
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? []);
  const [draft, setDraft] = useState("");

  const has = (s: string, from = skills) => from.some((x) => x.toLowerCase() === s.toLowerCase());
  const addMany = (raw: string) => {
    const next = [...skills];
    for (const s of raw.split(",").map((x) => x.trim().slice(0, 40)).filter(Boolean)) {
      if (next.length < MAX_SKILLS && !has(s, next)) next.push(s);
    }
    setSkills(next); setDraft("");
    return next;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalSkills = draft.trim() ? addMany(draft) : skills;
    onSubmit({ name: name.trim(), education: education.trim(), target_role: role.trim() || "ML Engineer Intern", skills: finalSkills });
  };

  return (
    <form onSubmit={submit} className="mt-6 max-w-xl space-y-6">
      <Field id="pf-name" label="Your name">
        <input id="pf-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required disabled={disabled} autoComplete="name" />
      </Field>
      <Field id="pf-edu" label="Education" hint="Optional. For example: B.Tech Computer Science, 3rd year.">
        <input id="pf-edu" aria-describedby="pf-edu-hint" className={inputCls} value={education} onChange={(e) => setEducation(e.target.value)} maxLength={200} disabled={disabled} />
      </Field>
      <Field id="pf-role" label="Target role" hint="Skill coverage is calculated for roles CareerTwin knows. For any other role you will see a note instead of a score.">
        <input id="pf-role" aria-describedby="pf-role-hint" className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} disabled={disabled} />
      </Field>
      <Field id="pf-skill" label="Your skills" hint="Type a skill and press Enter or comma. Up to 60.">
        <div className="flex flex-wrap gap-2" aria-live="polite">
          {skills.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full border-2 border-line bg-gold py-1 pl-3 pr-1.5 text-sm font-semibold">
              {s}
              <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} disabled={disabled} aria-label={`Remove ${s}`}
                className="grid h-5 w-5 place-items-center rounded-full hover:bg-ink hover:text-snow"><X size={12} aria-hidden /></button>
            </span>))}
        </div>
        <input id="pf-skill" aria-describedby="pf-skill-hint" className={`${inputCls} mt-2`} value={draft} maxLength={40} disabled={disabled || skills.length >= MAX_SKILLS}
          placeholder={skills.length >= MAX_SKILLS ? "Skill limit reached" : "Add a skill"}
          onChange={(e) => { const v = e.target.value; if (v.includes(",")) addMany(v); else setDraft(v); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (draft.trim()) addMany(draft); } }}
          onBlur={() => { if (draft.trim()) addMany(draft); }} />
        <p className="mt-3 text-sm text-slate-400">Quick add:</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {SUGGESTED.filter((s) => !has(s)).map((s) => (
            <button key={s} type="button" disabled={disabled || skills.length >= MAX_SKILLS} onClick={() => setSkills([...skills, s])}
              className="rounded-full border-2 border-dashed border-line bg-snow px-3 py-1 text-sm font-medium hover:bg-pink disabled:opacity-50">+ {s}</button>))}
        </div>
      </Field>
      <button type="submit" disabled={disabled || !name.trim()} className={primaryBtn}>{saving ? savingLabel : submitLabel}</button>
    </form>
  );
}