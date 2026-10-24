"""Transparent skill-coverage engine. No ML here yet: explicit mappings + weights.
Essential skills weigh 2, preferred skills weigh 1 (a documented, editable rule)."""
ROLES = {
    "ML Engineer Intern": {
        "essential": ["python", "pandas", "scikit-learn", "sql", "git", "model evaluation"],
        "preferred": ["pytorch", "docker", "fastapi", "feature engineering"],
    },
}
W_ESSENTIAL, W_PREFERRED = 2, 1

def skill_coverage(user_skills, role):
    spec = ROLES.get(role)
    if spec is None:
        raise KeyError(f"Unknown role: {role}")
    have = {s.strip().lower() for s in user_skills if s.strip()}
    matched, missing = [], []
    earned = total = 0
    for level, weight in (("essential", W_ESSENTIAL), ("preferred", W_PREFERRED)):
        for skill in spec[level]:
            total += weight
            hit = skill in have
            (matched if hit else missing).append({"skill": skill, "level": level, "weight": weight})
            earned += weight if hit else 0
    return {"score": round(100 * earned / total), "earned": earned, "total": total,
            "matched": matched, "missing": missing,
            "formula": "sum(weights of skills you listed) / sum(all weights) x 100; essential=2, preferred=1"}
