# Group Travel Matcher (Neeraj's Team)

## Setup

### 0. GitHub (repo owner)
- Add `ASR222` as a collaborator.
- Keep the repo **private** until submission (Settings → Danger Zone → Change visibility) so other teams can't copy it.

### 1. Clone and set your identity
```bash
git clone https://github.com/neeraj477/Group_Travel_Matcher_-Neeraj-s_Team-.git
cd Group_Travel_Matcher_-Neeraj-s_Team-
git config user.name "<Your Name>"
git config user.email "<your GitHub email or noreply address>"
```

### 2. Read the plan
- `NEERAJ-PLAN.md` sections 1–5: the work split, endpoints and screens, workflow, and gates.
- `CLAUDE.md` (root) and `DECISIONS.md`.

### 3. Add the per-service CLAUDE.md files
- Copy `NEERAJ-PLAN.md` section 9 to `search-service/CLAUDE.md`.
- Copy `NEERAJ-PLAN.md` section 10 to `frontend/CLAUDE.md`.
- Commit and push.

### 4. Scaffold the services (with Claude Code: plan first, then approve)
- **search-service**: Express + TypeScript on port `4000`. Only `GET /health` for now. Opens the database with `better-sqlite3` in read-only mode, using `DB_PATH` (default `../app.db`). Commit.
- **frontend**: Next.js + TypeScript on port `3000`. A placeholder home page, plus empty `lib/groupApi.ts` and `lib/searchApi.ts`. Commit.

## Rules
- Commit only in `search-service/` and `frontend/`.
- Run `git pull --rebase` before every push.
- Never commit `node_modules`, `.next` or `app.db`.
- Write your own commit messages, because the Git history is judged.
- No feature code until `CONTRACT.md` has been agreed as a team.

## Milestones
- **Contract:** the team agrees `CONTRACT.md` together before any feature work starts.
- **Gate 1 (14:00):** Priya's search shows exactly `G-01` and `G-08` in the browser.
