"""Transparent, rule-based scoring for the three indicators that come from the user's own input.

Nothing here is a trained model and nothing is invented: every score is a plain ratio over data the user
entered, and every result carries the formula that produced it.
"""
import re

MIN_JD_SKILLS = 3

# canonical skill -> extra spellings. Everything is matched case-insensitively as a whole token,
# so "Java" does not match inside "JavaScript" and "SQL" does not match inside "MySQL".
VOCAB: dict[str, list[str]] = {
    "Python": ["python3"], "Java": [], "JavaScript": [], "TypeScript": [], "C++": [], "C#": [], "Go": ["golang"],
    "Rust": [], "SQL": [], "R": ["r programming", "r language", "rstudio"], "MATLAB": [], "Scala": [],
    "Kotlin": [], "Swift": [], "HTML": ["html5"], "CSS": ["css3"], "React": ["reactjs", "react.js"],
    "Angular": [], "Vue": ["vue.js", "vuejs"], "Node.js": ["nodejs", "node js"], "Django": [], "Flask": [],
    "FastAPI": [], "Spring": ["spring boot"], "Pandas": [], "NumPy": [], "SciPy": [],
    "Scikit-learn": ["sklearn", "scikit learn"], "TensorFlow": [], "PyTorch": [], "Keras": [],
    "XGBoost": [], "OpenCV": [], "NLP": ["natural language processing"], "Computer Vision": [],
    "Machine Learning": [], "Deep Learning": [], "Statistics": ["statistical analysis"],
    "Data Analysis": ["data analytics"], "Data Visualization": ["data visualisation"],
    "Data Cleaning": ["data preprocessing", "data wrangling"], "Feature Engineering": [],
    "Model Evaluation": ["cross-validation", "cross validation"], "Matplotlib": [], "Seaborn": [],
    "Tableau": [], "Power BI": [], "Excel": [], "Jupyter": [], "Streamlit": [], "Git": [], "GitHub": [],
    "Docker": [], "Kubernetes": ["k8s"], "AWS": ["amazon web services"], "Azure": [], "GCP": ["google cloud"],
    "Linux": [], "REST APIs": ["rest api", "restful", "restful api", "restful apis"], "GraphQL": [],
    "MongoDB": [], "PostgreSQL": ["postgres"], "MySQL": [], "SQLite": [], "Redis": [],
    "Spark": ["pyspark", "apache spark"], "Hadoop": [], "Airflow": [], "Kafka": [], "ETL": [],
    "CI/CD": ["cicd"], "Agile": [], "Scrum": [], "Unit Testing": ["unit tests", "pytest", "jest"],
    "Data Structures": [], "Algorithms": [], "Object-Oriented Programming": ["oop", "object oriented"],
    "LLMs": ["llm", "large language models"], "Prompt Engineering": [], "Hugging Face": ["huggingface"],
}


def _compile(canon: str, aliases: list[str]) -> re.Pattern:
    terms = {canon.lower(), *(a.lower() for a in aliases)}
    alts = "|".join(sorted((re.escape(t).replace(r"\ ", r"\s+") for t in terms), key=len, reverse=True))
    return re.compile(rf"(?<![A-Za-z0-9+#])(?:{alts})(?![A-Za-z0-9+#])", re.I)


_PATTERNS = {canon: _compile(canon, aliases) for canon, aliases in VOCAB.items()}


def extract_skills(text: str) -> set[str]:
    """Canonical names of every recognised skill that appears in the text."""
    return {canon for canon, pat in _PATTERNS.items() if pat.search(text or "")}


def skill_key(skill: str) -> str:
    """Normalised comparison key, so 'sklearn' and 'Scikit-learn' count as the same skill."""
    found = extract_skills(skill)
    return (next(iter(found)) if len(found) == 1 else skill).strip().lower()


def clean_skills(v: list[str]) -> list[str]:
    """Trim, drop empties, de-duplicate case-insensitively, cap each skill at 40 characters."""
    seen: set[str] = set()
    out: list[str] = []
    for s in (x.strip() for x in v):
        if not s:
            continue
        if len(s) > 40:
            raise ValueError(f"skill '{s[:20]}...' is longer than 40 characters")
        if s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def _pending(why: str) -> dict:
    return {"score": None, "reason": why}


def _by_name(items) -> list:
    return sorted(items, key=str.lower)


# ---------------------------------------------------------------- resume alignment
def resume_indicator(resume) -> dict:
    if resume is None or not resume.resume_text.strip():
        return _pending("Paste your resume on the Resume match page to see this.")
    if not resume.job_description.strip():
        return _pending("Paste a job description on the Resume match page to compare against.")
    wanted = extract_skills(resume.job_description)
    if len(wanted) < MIN_JD_SKILLS:
        return _pending(f"The job description names fewer than {MIN_JD_SKILLS} skills CareerTwin recognises. Paste the full posting.")
    have = extract_skills(resume.resume_text)
    matched, missing = _by_name(wanted & have), _by_name(wanted - have)
    return {"score": round(100 * len(matched) / len(wanted)), "evidence": {
        "matched": matched, "missing": missing,
        "formula": "skills named in the job description that also appear in your resume / all recognised skills in the job description x 100",
        "note": f"This is a keyword check against CareerTwin's built-in list of {len(VOCAB)} common technical skills. "
                "It does not judge the quality of your resume.",
    }}


# ---------------------------------------------------------------- project evidence
def project_indicator(skills: list[str], projects) -> dict:
    if not skills:
        return _pending("Add skills to your profile first.")
    if not projects:
        return _pending("Add a project that uses your skills on the Projects page.")
    used: dict[str, list[str]] = {}
    for pr in projects:
        keys = {skill_key(s) for s in (pr.skills or [])} | {skill_key(s) for s in extract_skills(pr.description)}
        for k in keys:
            used.setdefault(k, []).append(pr.title)
    shown = [{"skill": s, "projects": used[skill_key(s)]} for s in skills if skill_key(s) in used]
    not_shown = [s for s in skills if skill_key(s) not in used]
    return {"score": round(100 * len(shown) / len(skills)), "evidence": {
        "shown": shown, "not_shown": not_shown,
        "formula": "profile skills that appear in at least one of your projects / all profile skills x 100",
        "note": "Projects are tagged by you, so this shows which skills you have linked to real work, not how well you used them.",
    }}


# ---------------------------------------------------------------- interview practice
INTERVIEW_QUESTIONS = [
    {"id": "q1", "category": "Behavioural", "text": "Tell me about yourself and why you are applying for this role."},
    {"id": "q2", "category": "Behavioural", "text": "Describe a project you are proud of. What was your part, and what did you learn?"},
    {"id": "q3", "category": "Behavioural", "text": "Tell me about a time you were stuck on a problem. How did you get unstuck?"},
    {"id": "q4", "category": "Behavioural", "text": "Describe a disagreement with a teammate. What happened and how did it end?"},
    {"id": "q5", "category": "Technical", "text": "Your code fails and you do not know why. How do you find the problem?"},
    {"id": "q6", "category": "Technical", "text": "Explain a technical idea you know well to someone with no background in it."},
    {"id": "q7", "category": "Technical", "text": "How would you decide whether something you built is actually working?"},
    {"id": "q8", "category": "Technical", "text": "What is the difference between a list and a set, and when would you use each?"},
    {"id": "q9", "category": "Role fit", "text": "Which skills are you weakest in for this role, and how are you improving them?"},
    {"id": "q10", "category": "Role fit", "text": "Why this role, and where do you want to be in two years?"},
]
QUESTION_IDS = {q["id"] for q in INTERVIEW_QUESTIONS}
CONFIDENT_AT = 4


def interview_indicator(practice) -> dict:
    if not practice:
        return _pending("Answer a question on the Interview practice page and rate your own answer to start.")
    total = len(INTERVIEW_QUESTIONS)
    confident = sum(1 for x in practice if x.rating >= CONFIDENT_AT)
    return {"score": round(100 * confident / total), "evidence": {
        "practiced": len(practice), "confident": confident, "total": total,
        "formula": f"questions you rated {CONFIDENT_AT} or 5 / all {total} questions x 100",
        "note": "Self-assessed: this shows how ready you feel, not how an interviewer would score you.",
    }}
