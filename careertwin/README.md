# CareerTwin (Phase 1: foundation)
**Run (two terminals):**
1. `cd backend && pip install -r requirements.txt && uvicorn app.main:app --port 8000`
2. `cd frontend && npm install && npm run dev` then open http://localhost:5173

**Test:** `cd backend && python -m pytest`

**Implemented:** demo profile, dashboard with explainable skill coverage and learning progress, milestone tracking, profile deletion.
**Not yet implemented:** resume parsing, job matching, roadmap, projects, interviews, tracker, portfolio checker, coach. Indicators that need those show "Not enough data yet".
