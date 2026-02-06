# Here are your Instructions
# MultiModel — AI Council Hub (monorepo)

A working **multi-model AI hub** (the “Council”) with a **frontend UI** and a **backend API**. The app routes prompts to multiple providers, normalizes outputs into a consistent record, and supports exporting artifacts for downstream analysis/ingestion (e.g., EDCM).

**Attribution:** GPT generated; context, prompt Erin Spencer

---

## Repo layout (this repo as-built)

This repository is a **monorepo**:

- `frontend/` — the UI (client)
- `backend/` — the API server (provider adapters + routing)
- `memory/` — local/persistent artifacts (app state, logs, exports)
- `tests/`, `test_reports/` — automated checks + outputs
- `.emergent/` — Emergent agent scaffolding / metadata
- `auth_testing.md` — notes around auth experiments
- `backend_test.py`, `test_result.md` — ad-hoc test harness / results

> If you’re looking for exact run commands, **start with `frontend/` and `backend/`**—each side should contain (or imply) its own scripts/config.  
> This README focuses on what the system *is* and how it’s *meant* to work. 1

---

## What this app does

### The “Council” pattern
You can query multiple models/providers, then:

- display side-by-side answers
- optionally run an adjudication/merge pass
- store the whole run as a replayable “bundle” (input → routing → responses → exports)

### Normalized outputs
The backend should return a single canonical structure so downstream tools don’t care which vendor produced the text.

### Exports (for EDCM + other engines)
A run can be exported as:
- JSON (single bundle)
- JSONL (append-only event log)
- optional redacted version for sharing

---

## Concepts (how to think about the code)

### 1) Router
Decides **which models** to call and **how**:
- broadcast (all models)
- targeted (subset)
- debate (draft → critique → revise)
- adjudicate (judge merges/scores)

### 2) Provider adapters
One adapter per provider:
- translate internal request → provider API call
- translate provider response → internal response schema

### 3) Normalizer
Creates stable fields across all models:
- `text`
- `provider`, `model`
- latency/tokens/metadata (when available)
- errors (captured, not hidden)

### 4) Storage
Local-first by default:
- runs saved under `memory/`
- exports written as immutable artifacts

---

## Local-first + gating

This hub is designed to be safe to operate:

- **Local-first**: keep raw + normalized records locally unless you explicitly push somewhere.
- **Gating**: any “action” mode (posting, emailing, writing outside the workspace) should require explicit approval.

---

## Quick start (safe / non-assumptive)

Because different scaffolds use different scripts, use this pattern:

### Backend
1. `cd backend`
2. create env file if needed (see backend docs/config)
3. install dependencies using whatever the backend declares
4. run the dev server using the backend’s start command

### Frontend
1. `cd frontend`
2. install dependencies using whatever the frontend declares
3. run the dev server using the frontend’s start command

> If you want a single command boot, add a top-level runner later (Makefile / scripts / docker-compose). This README doesn’t assume it exists yet.

---

## API contract (recommended)

Even if implementations evolve, keep the API contract stable:

### `POST /api/council/run`
Body:
- `input`: user prompt
- `mode`: broadcast | targeted | debate | adjudicate
- `models`: optional explicit list
- `context`: optional system/context payload

Returns:
- `run_id`
- `routing` (what was called and why)
- `responses[]` (normalized)
- `export_paths` (if exported)

### `GET /api/council/run/:run_id`
Returns the full saved bundle from `memory/`.

---

## hmm container (standing marker)

**hmm:** This repo is an orchestration hub, but the long-term architecture needs one explicit decision:
- Do we treat “Council output” as *the product*, or as *raw material for EDCM / PCNA / TIW demonstration engines*?

This README assumes: **Council output is raw material** (instrumentation), not the final truth.

---

## Roadmap (near-term)

- [ ] Publish the canonical response schema (JSON Schema) under `memory/` or a `schema/` dir
- [ ] Add an explicit export format for EDCM ingestion
- [ ] Add a “redaction profile” before sharing logs
- [ ] Add a top-level `dev` runner (optional)

---

## License

Choose a license when you’re ready to open it wider (MIT/Apache-2.0 are common). If you already have one in-repo, it wins.

---

## Credits / provenance

Erin Spencer — product direction + systems intent  
**Attribution:** GPT generated; context, prompt Erin Spencer
