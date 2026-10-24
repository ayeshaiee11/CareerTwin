"""Backend API tests. Run from the backend root (the folder holding app/ and engine/):

    pip install pytest httpx
    python -m pytest tests -q

Uses its own temporary SQLite file, so careertwin.db is never touched.
"""
import os
import tempfile

# Must be set before app.db is imported, because the engine is created at import time.
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db")

import pytest
from fastapi.testclient import TestClient

from app import main
from app.db import Base, SessionLocal, engine
from app.models import Milestone


@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    return TestClient(main.app, raise_server_exceptions=False)


def demo_id(c) -> int:
    return c.post("/api/profiles/demo").json()["data"]["id"]


def test_demo_dashboard_has_five_indicators_and_no_phase_text(client):
    pid = demo_id(client)
    r = client.get(f"/api/dashboard/{pid}")
    assert r.status_code == 200
    d = r.json()["data"]
    assert set(d["indicators"]) == {"skill_coverage", "learning_progress", "resume_alignment", "project_evidence", "interview_prep"}
    assert len(d["milestones"]) == 4
    assert d["profile"]["is_demo"] is True
    for ind in d["indicators"].values():
        assert "Phase" not in (ind.get("reason") or "")


def test_unknown_profile_returns_envelope_404(client):
    r = client.get("/api/dashboard/9999")
    assert r.status_code == 404
    assert r.json()["data"] is None and "not found" in r.json()["error"].lower()


def test_unknown_route_uses_same_envelope(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.json()["data"] is None and r.json()["error"]


def test_create_profile_cleans_input(client):
    r = client.post("/api/profiles", json={"name": "  Asha  ", "skills": [" Python ", "python", "", "SQL"], "target_role": " Data Analyst "})
    assert r.status_code == 200
    pid = r.json()["data"]["id"]
    p = client.get(f"/api/dashboard/{pid}").json()["data"]["profile"]
    assert p["name"] == "Asha" and p["target_role"] == "Data Analyst"
    assert p["skills"] == ["Python", "SQL"] and p["is_demo"] is False


def test_create_profile_uses_default_role_when_missing(client):
    pid = client.post("/api/profiles", json={"name": "Asha"}).json()["data"]["id"]
    assert client.get(f"/api/dashboard/{pid}").json()["data"]["profile"]["target_role"] == main.DEFAULT_ROLE


@pytest.mark.parametrize("payload", [
    {"name": ""}, {"name": "   "}, {"name": "x" * 81}, {"name": "A", "skills": ["x" * 41]}, {"name": "A", "skills": ["s"] * 61},
])
def test_create_profile_rejects_bad_input_with_readable_error(client, payload):
    r = client.post("/api/profiles", json=payload)
    assert r.status_code == 422
    assert r.json()["data"] is None and r.json()["error"].startswith("Please check your input")


def test_update_profile_replaces_skills(client):
    pid = client.post("/api/profiles", json={"name": "A", "skills": ["Python"]}).json()["data"]["id"]
    assert client.put(f"/api/profiles/{pid}", json={"name": "B", "skills": ["Go", "Rust"]}).status_code == 200
    p = client.get(f"/api/dashboard/{pid}").json()["data"]["profile"]
    assert p["name"] == "B" and p["skills"] == ["Go", "Rust"]
    assert client.put("/api/profiles/9999", json={"name": "B"}).status_code == 404


def test_milestone_add_toggle_delete(client):
    pid = client.post("/api/profiles", json={"name": "A"}).json()["data"]["id"]
    d = client.get(f"/api/dashboard/{pid}").json()["data"]
    assert d["indicators"]["learning_progress"]["score"] is None  # empty state, not a fake 0%

    r = client.post(f"/api/profiles/{pid}/milestones", json={"title": "  Learn SQL  "})
    assert r.status_code == 201
    mid = r.json()["data"]["id"]
    assert r.json()["data"]["title"] == "Learn SQL" and r.json()["data"]["done"] is False

    assert client.patch(f"/api/milestones/{mid}").json()["data"]["done"] is True
    assert client.get(f"/api/dashboard/{pid}").json()["data"]["indicators"]["learning_progress"]["score"] == 100

    assert client.delete(f"/api/milestones/{mid}").status_code == 200
    assert client.delete(f"/api/milestones/{mid}").status_code == 404
    assert client.patch(f"/api/milestones/{mid}").status_code == 404


def test_milestone_validation_and_cap(client):
    pid = client.post("/api/profiles", json={"name": "A"}).json()["data"]["id"]
    assert client.post(f"/api/profiles/{pid}/milestones", json={"title": "   "}).status_code == 422
    assert client.post(f"/api/profiles/{pid}/milestones", json={"title": "x" * 121}).status_code == 422
    assert client.post("/api/profiles/9999/milestones", json={"title": "ok"}).status_code == 404
    for i in range(main.MAX_MILESTONES):
        assert client.post(f"/api/profiles/{pid}/milestones", json={"title": f"m{i}"}).status_code == 201
    r = client.post(f"/api/profiles/{pid}/milestones", json={"title": "one too many"})
    assert r.status_code == 409 and "at most" in r.json()["error"]


def test_deleting_a_profile_removes_its_milestones(client):
    pid = demo_id(client)
    assert client.delete(f"/api/profiles/{pid}").status_code == 200
    assert client.get(f"/api/dashboard/{pid}").status_code == 404
    with SessionLocal() as db:
        assert db.query(Milestone).count() == 0


def test_dashboard_survives_scoring_failure(client, monkeypatch):
    def boom(*_a, **_k): raise ValueError("unsupported role")
    monkeypatch.setattr(main, "skill_coverage", boom)
    r = client.get(f"/api/dashboard/{demo_id(client)}")
    assert r.status_code == 200
    ind = r.json()["data"]["indicators"]["skill_coverage"]
    assert ind["score"] is None and ind["reason"]


def test_unexpected_error_returns_json_500(client, monkeypatch):
    def boom(*_a, **_k): raise RuntimeError("db exploded")
    monkeypatch.setattr(main, "get_profile", boom)
    r = client.get("/api/dashboard/1")
    assert r.status_code == 500
    assert r.json() == {"data": None, "error": "Something went wrong on the server."}


# ------------------------------------------------------------------ resume alignment
JD = "We need Python, SQL, Pandas and Git. Experience with Docker is a plus."


def new_profile(c, **extra) -> int:
    return c.post("/api/profiles", json={"name": "Asha", "skills": ["Python", "SQL"], **extra}).json()["data"]["id"]


def indicators(c, pid):
    return c.get(f"/api/dashboard/{pid}").json()["data"]["indicators"]


def test_resume_pending_until_both_texts_exist(client):
    pid = new_profile(client)
    assert indicators(client, pid)["resume_alignment"]["score"] is None
    client.put(f"/api/profiles/{pid}/resume", json={"resume_text": "I know Python."})
    ind = indicators(client, pid)["resume_alignment"]
    assert ind["score"] is None and "job description" in ind["reason"]


def test_resume_score_is_a_visible_ratio(client):
    pid = new_profile(client)
    r = client.put(f"/api/profiles/{pid}/resume",
                   json={"resume_text": "Built tools in Python and SQL, versioned with Git.", "job_description": JD})
    assert r.status_code == 200
    ind = indicators(client, pid)["resume_alignment"]
    # JD names Python, SQL, Pandas, Git, Docker (5); resume has Python, SQL, Git (3)
    assert ind["score"] == 60
    assert ind["evidence"]["matched"] == ["Git", "Python", "SQL"]
    assert ind["evidence"]["missing"] == ["Docker", "Pandas"]
    assert "formula" in ind["evidence"]


def test_resume_matching_uses_whole_tokens(client):
    from app.insights import extract_skills
    assert extract_skills("JavaScript and MySQL") == {"JavaScript", "MySQL"}  # not Java, not SQL
    assert "Scikit-learn" in extract_skills("used sklearn daily")
    assert "Git" not in extract_skills("hosted on GitHub") and "GitHub" in extract_skills("hosted on GitHub")


def test_resume_needs_enough_recognised_skills(client):
    pid = new_profile(client)
    client.put(f"/api/profiles/{pid}/resume", json={"resume_text": "Python", "job_description": "Looking for a friendly person."})
    ind = indicators(client, pid)["resume_alignment"]
    assert ind["score"] is None and "fewer than 3" in ind["reason"]


def test_resume_can_be_cleared_and_is_length_limited(client):
    pid = new_profile(client)
    client.put(f"/api/profiles/{pid}/resume", json={"resume_text": "Python", "job_description": JD})
    assert client.delete(f"/api/profiles/{pid}/resume").status_code == 200
    assert client.get(f"/api/dashboard/{pid}").json()["data"]["resume"] is None
    assert client.put(f"/api/profiles/{pid}/resume", json={"resume_text": "x" * 20_001}).status_code == 422


# ------------------------------------------------------------------ projects
def test_project_evidence_formula(client):
    pid = new_profile(client)  # skills: Python, SQL
    assert indicators(client, pid)["project_evidence"]["score"] is None
    r = client.post(f"/api/profiles/{pid}/projects",
                    json={"title": "Churn model", "url": "https://github.com/x/y", "skills": ["python"], "description": "Cleaned data"})
    assert r.status_code == 201
    ind = indicators(client, pid)["project_evidence"]
    assert ind["score"] == 50
    assert ind["evidence"]["shown"] == [{"skill": "Python", "projects": ["Churn model"]}]
    assert ind["evidence"]["not_shown"] == ["SQL"]


def test_project_skills_can_come_from_the_description(client):
    pid = new_profile(client)
    client.post(f"/api/profiles/{pid}/projects", json={"title": "ETL", "description": "Loaded rows with SQL and Python"})
    assert indicators(client, pid)["project_evidence"]["score"] == 100


@pytest.mark.parametrize("payload", [
    {"title": ""}, {"title": "ok", "url": "javascript:alert(1)"}, {"title": "ok", "url": "https://a b.com"},
    {"title": "ok", "description": "x" * 501}, {"title": "ok", "skills": ["s"] * 21},
])
def test_project_rejects_bad_input(client, payload):
    pid = new_profile(client)
    assert client.post(f"/api/profiles/{pid}/projects", json=payload).status_code == 422


def test_project_delete_and_cap(client):
    pid = new_profile(client)
    prid = client.post(f"/api/profiles/{pid}/projects", json={"title": "A"}).json()["data"]["id"]
    assert client.delete(f"/api/projects/{prid}").status_code == 200
    assert client.delete(f"/api/projects/{prid}").status_code == 404
    for i in range(main.MAX_PROJECTS):
        assert client.post(f"/api/profiles/{pid}/projects", json={"title": f"p{i}"}).status_code == 201
    assert client.post(f"/api/profiles/{pid}/projects", json={"title": "extra"}).status_code == 409


# ------------------------------------------------------------------ interview practice
def test_interview_score_counts_confident_questions(client):
    pid = new_profile(client)
    assert indicators(client, pid)["interview_prep"]["score"] is None
    assert client.put(f"/api/profiles/{pid}/practice/q1", json={"answer": "hi", "rating": 5}).status_code == 200
    assert client.put(f"/api/profiles/{pid}/practice/q2", json={"rating": 2}).status_code == 200
    ev = indicators(client, pid)["interview_prep"]
    assert ev["score"] == 10 and ev["evidence"] == {**ev["evidence"], "practiced": 2, "confident": 1, "total": 10}
    # re-rating the same question updates it instead of adding a row
    client.put(f"/api/profiles/{pid}/practice/q2", json={"rating": 4})
    d = client.get(f"/api/dashboard/{pid}").json()["data"]
    assert len(d["practice"]) == 2 and indicators(client, pid)["interview_prep"]["score"] == 20
    assert len(d["questions"]) == 10


@pytest.mark.parametrize("qid,body,status", [("q1", {"rating": 6}, 422), ("q1", {"rating": 0}, 422), ("q1", {}, 422),
                                             ("q99", {"rating": 3}, 404), ("q1", {"rating": 3, "answer": "x" * 2001}, 422)])
def test_practice_validation(client, qid, body, status):
    pid = new_profile(client)
    assert client.put(f"/api/profiles/{pid}/practice/{qid}", json=body).status_code == status


# ------------------------------------------------------------------ privacy: delete removes everything
def test_deleting_profile_removes_all_new_data(client):
    from app.models import Practice, Project, ResumeCheck
    pid = new_profile(client)
    client.put(f"/api/profiles/{pid}/resume", json={"resume_text": "Python", "job_description": JD})
    client.post(f"/api/profiles/{pid}/projects", json={"title": "A"})
    client.put(f"/api/profiles/{pid}/practice/q1", json={"rating": 3, "answer": "private words"})
    assert client.delete(f"/api/profiles/{pid}").status_code == 200
    with SessionLocal() as db:
        assert (db.query(Project).count(), db.query(ResumeCheck).count(), db.query(Practice).count()) == (0, 0, 0)


def test_existing_database_without_new_tables_is_upgraded(tmp_path):
    """The old careertwin.db has only profiles + milestones; create_all must add the rest without losing rows."""
    import sqlite3, subprocess, sys, textwrap
    db = tmp_path / "old.db"
    con = sqlite3.connect(db)
    con.executescript("""
      CREATE TABLE profiles (id INTEGER NOT NULL, name VARCHAR NOT NULL, education VARCHAR NOT NULL,
        target_role VARCHAR NOT NULL, skills JSON NOT NULL, is_demo BOOLEAN NOT NULL, PRIMARY KEY (id));
      CREATE TABLE milestones (id INTEGER NOT NULL, profile_id INTEGER NOT NULL, title VARCHAR NOT NULL,
        done BOOLEAN NOT NULL, PRIMARY KEY (id), FOREIGN KEY(profile_id) REFERENCES profiles (id));
      INSERT INTO profiles VALUES (1,'Old Row','B.Tech','ML Engineer Intern','["Python"]',0);
      INSERT INTO milestones VALUES (1,1,'Keep me',1);""")
    con.commit(); con.close()
    code = textwrap.dedent("""
        from fastapi.testclient import TestClient
        from app.main import app
        r = TestClient(app).get('/api/dashboard/1').json()['data']
        assert r['profile']['name'] == 'Old Row' and r['milestones'][0]['title'] == 'Keep me', r
        assert r['projects'] == [] and r['resume'] is None and r['practice'] == []
        print('upgrade-ok')""")
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                         env={**os.environ, "DATABASE_URL": f"sqlite:///{db}"}, cwd=os.getcwd())
    assert "upgrade-ok" in out.stdout, out.stderr
