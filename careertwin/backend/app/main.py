import logging
from fastapi import Depends, FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException
from engine.roles import skill_coverage
from .db import Base, engine, get_db
from .insights import (INTERVIEW_QUESTIONS, QUESTION_IDS, clean_skills, interview_indicator,
                       project_indicator, resume_indicator)
from .models import Milestone, Practice, Profile, Project, ResumeCheck

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("careertwin")
Base.metadata.create_all(engine)  # adds any missing tables; existing tables and data are left alone
app = FastAPI(title="CareerTwin API")

DEFAULT_ROLE = "ML Engineer Intern"  # keep in sync with Profile.target_role default
MAX_MILESTONES = 50
MAX_PROJECTS = 20
MAX_TEXT = 20_000


def fail(status: int, message: str) -> JSONResponse:
    return JSONResponse({"data": None, "error": message}, status_code=status)


# Every error leaves the API in the same {"data": null, "error": "..."} shape the frontend expects.
@app.exception_handler(StarletteHTTPException)  # also covers FastAPI's HTTPException, unknown routes and 405s
async def http_err(_, exc: StarletteHTTPException):
    return fail(exc.status_code, str(exc.detail))


@app.exception_handler(RequestValidationError)
async def invalid(_, exc: RequestValidationError):
    msgs = "; ".join(e["msg"].removeprefix("Value error, ") for e in exc.errors())
    return fail(422, f"Please check your input: {msgs}")


@app.exception_handler(Exception)
async def crash(_, exc: Exception):
    log.exception("Unhandled error")
    return fail(500, "Something went wrong on the server.")


def ok(data): return {"data": data, "error": None}
def get_profile(db: Session, pid: int) -> Profile:
    p = db.get(Profile, pid)
    if not p: raise HTTPException(404, "Profile not found. It may have been deleted.")
    return p

# Fictional sample data. Not a real person.
DEMO = dict(name="Aarav Rao (demo)", education="B.Tech Computer Science, 3rd year", target_role=DEFAULT_ROLE,
            skills=["Python", "Pandas", "SQL", "Git", "Scikit-learn"], is_demo=True)
DEMO_TASKS = [("Finish Kaggle Intermediate ML", True), ("Build a tabular ML project", False),
              ("Learn model evaluation (cross-validation, metrics)", False), ("Add a README to one project", False)]


class ProfileIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=80)
    education: str = Field(default="", max_length=200)
    target_role: str = Field(default=DEFAULT_ROLE, min_length=1, max_length=80)
    skills: list[str] = Field(default_factory=list, max_length=60)

    @field_validator("skills")
    @classmethod
    def _skills(cls, v): return clean_skills(v)


class MilestoneIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=120)


class ProjectIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=80)
    url: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=500)
    skills: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("skills")
    @classmethod
    def _skills(cls, v): return clean_skills(v)

    @field_validator("url")
    @classmethod
    def _url(cls, v):
        if v and (not v.lower().startswith(("http://", "https://")) or " " in v):
            raise ValueError("project link must start with http:// or https:// and contain no spaces")
        return v


class ResumeIn(BaseModel):
    resume_text: str = Field(default="", max_length=MAX_TEXT)
    job_description: str = Field(default="", max_length=MAX_TEXT)


class PracticeIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    answer: str = Field(default="", max_length=2000)
    rating: int = Field(ge=1, le=5)


@app.get("/api/health")
def health(): return ok({"status": "up"})

@app.post("/api/profiles/demo")
def create_demo(db: Session = Depends(get_db)):
    p = Profile(**DEMO, milestones=[Milestone(title=t, done=d) for t, d in DEMO_TASKS])
    db.add(p); db.commit()
    return ok({"id": p.id})

@app.post("/api/profiles")
def create_profile(body: ProfileIn, db: Session = Depends(get_db)):
    p = Profile(**body.model_dump())
    db.add(p); db.commit()
    return ok({"id": p.id})

@app.put("/api/profiles/{pid}")
def update_profile(pid: int, body: ProfileIn, db: Session = Depends(get_db)):
    p = get_profile(db, pid)
    p.name, p.education, p.target_role = body.name, body.education, body.target_role
    p.skills = body.skills  # assign a new list: SQLAlchemy does not track in-place edits to JSON columns
    db.commit()
    return ok({"id": p.id})

@app.delete("/api/profiles/{pid}")
def delete_profile(pid: int, db: Session = Depends(get_db)):
    db.delete(get_profile(db, pid)); db.commit()  # milestones, projects, resume and practice go too (cascade)
    return ok({"deleted": True})

# ---- milestones
@app.post("/api/profiles/{pid}/milestones", status_code=201)
def add_milestone(pid: int, body: MilestoneIn, db: Session = Depends(get_db)):
    p = get_profile(db, pid)
    if len(p.milestones) >= MAX_MILESTONES:
        raise HTTPException(409, f"A profile can have at most {MAX_MILESTONES} milestones.")
    m = Milestone(profile_id=p.id, title=body.title)
    db.add(m); db.commit()
    return ok({"id": m.id, "title": m.title, "done": m.done})

@app.patch("/api/milestones/{mid}")
def toggle(mid: int, db: Session = Depends(get_db)):
    m = db.get(Milestone, mid)
    if not m: raise HTTPException(404, "Milestone not found.")
    m.done = not m.done; db.commit()
    return ok({"id": m.id, "done": m.done})

@app.delete("/api/milestones/{mid}")
def delete_milestone(mid: int, db: Session = Depends(get_db)):
    m = db.get(Milestone, mid)
    if not m: raise HTTPException(404, "Milestone not found.")
    db.delete(m); db.commit()
    return ok({"deleted": True})

# ---- resume + job description
@app.put("/api/profiles/{pid}/resume")
def save_resume(pid: int, body: ResumeIn, db: Session = Depends(get_db)):
    p = get_profile(db, pid)
    if p.resume is None:
        p.resume = ResumeCheck(resume_text=body.resume_text, job_description=body.job_description)
    else:
        p.resume.resume_text, p.resume.job_description = body.resume_text, body.job_description
    db.commit()
    return ok({"saved": True})

@app.delete("/api/profiles/{pid}/resume")
def clear_resume(pid: int, db: Session = Depends(get_db)):
    p = get_profile(db, pid)
    p.resume = None; db.commit()  # delete-orphan cascade removes the row
    return ok({"deleted": True})

# ---- projects
@app.post("/api/profiles/{pid}/projects", status_code=201)
def add_project(pid: int, body: ProjectIn, db: Session = Depends(get_db)):
    p = get_profile(db, pid)
    if len(p.projects) >= MAX_PROJECTS:
        raise HTTPException(409, f"A profile can have at most {MAX_PROJECTS} projects.")
    pr = Project(profile_id=p.id, **body.model_dump())
    db.add(pr); db.commit()
    return ok({"id": pr.id})

@app.delete("/api/projects/{prid}")
def delete_project(prid: int, db: Session = Depends(get_db)):
    pr = db.get(Project, prid)
    if not pr: raise HTTPException(404, "Project not found.")
    db.delete(pr); db.commit()
    return ok({"deleted": True})

# ---- interview practice
@app.put("/api/profiles/{pid}/practice/{qid}")
def save_practice(pid: int, qid: str, body: PracticeIn, db: Session = Depends(get_db)):
    p = get_profile(db, pid)
    if qid not in QUESTION_IDS: raise HTTPException(404, "Question not found.")
    row = next((x for x in p.practice if x.question_id == qid), None)
    if row: row.answer, row.rating = body.answer, body.rating
    else: db.add(Practice(profile_id=p.id, question_id=qid, answer=body.answer, rating=body.rating))
    db.commit()
    return ok({"question_id": qid, "rating": body.rating})

# ---- projection: what would my skill coverage be if I learned these skills, week by week?
class ProjectionIn(BaseModel):
    steps: list[list[str]] = Field(default_factory=list, max_length=60)

@app.post("/api/profiles/{pid}/projection")
def projection(pid: int, body: ProjectionIn, db: Session = Depends(get_db)):
    p = get_profile(db, pid)
    have = list(p.skills or [])
    scores = []
    for step in body.steps:
        have = clean_skills(have + [s.strip()[:40] for s in step[:20] if isinstance(s, str)])
        try:
            cov = skill_coverage(have, p.target_role)
            scores.append(cov.get("score") if cov else None)
        except Exception:
            log.exception("projection failed for role %r", p.target_role)
            scores.append(None)
    return ok({"scores": scores})

# ---- dashboard (everything the UI needs in one response)
@app.get("/api/dashboard/{pid}")
def dashboard(pid: int, db: Session = Depends(get_db)):
    p = get_profile(db, pid)
    pending = lambda why: {"score": None, "reason": why}
    try:
        cov = skill_coverage(p.skills, p.target_role)
    except Exception:  # a role the scoring engine can't handle should not take the whole dashboard down
        log.exception("skill_coverage failed for role %r", p.target_role)
        cov = None
    if cov and cov.get("score") is not None:
        skills_ind = {"score": cov["score"], "evidence": cov}
    else:
        skills_ind = pending((cov or {}).get("reason") or "Skill coverage can't be calculated for this role yet. Check the target role on the Profile page.")
    done = sum(m.done for m in p.milestones); total = len(p.milestones)
    return ok({
        "profile": {"id": p.id, "name": p.name, "education": p.education, "target_role": p.target_role,
                    "is_demo": p.is_demo, "skills": p.skills},
        "indicators": {
            "skill_coverage": skills_ind,
            "learning_progress": ({"score": round(100 * done / total), "evidence": {"done": done, "total": total,
                "formula": "completed milestones / all milestones x 100"}} if total else pending("Add milestones to track progress.")),
            "resume_alignment": resume_indicator(p.resume),
            "project_evidence": project_indicator(p.skills, p.projects),
            "interview_prep": interview_indicator(p.practice),
        },
        "milestones": [{"id": m.id, "title": m.title, "done": m.done} for m in p.milestones],
        "projects": [{"id": x.id, "title": x.title, "url": x.url, "description": x.description, "skills": x.skills}
                     for x in p.projects],
        "resume": ({"resume_text": p.resume.resume_text, "job_description": p.resume.job_description}
                   if p.resume else None),
        "practice": [{"question_id": x.question_id, "answer": x.answer, "rating": x.rating} for x in p.practice],
        "questions": INTERVIEW_QUESTIONS,
        "note": "Scores are transparent heuristics, not a prediction of hiring outcomes.",
    })