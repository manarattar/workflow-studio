# Routing Slip

A routing slip is the form clipped to a document to send it through an office. This one is
written in plain words: describe a business process, and it becomes a working workflow that runs on
a real inbox and reports how much it automated, how accurate it was, and what it cost.

Live demo: **[studio.manarattar.com](https://studio.manarattar.com)**

```
"Block anything that looks like fraud. If there's no purchase order number, ask the
 supplier for it. Invoices over €1,000 need a manager; pay the rest automatically."
                                   │
                                   ▼  LLM compiles it, validator checks it, LLM fixes it
┌──────────────┐  no   ┌──────────────┐  no   ┌───────────────┐  no   ┌─────────────────┐
│ JEV          │──────▶│ CODE         │──────▶│ CODE          │──────▶│ pay             │
│ looks like   │       │ PO number    │       │ amount >      │       │ automatically   │
│ fraud?       │       │ missing?     │       │ €1,000?       │       └─────────────────┘
└──────┬───────┘       └──────┬───────┘       └──────┬────────┘
   yes │   unsure         yes │                   yes │
       ▼      ╲               ▼                       ▼
  block fraud  ╲─▶ human   LLM drafts a        manager approval
                   review  request to supplier
```

## The idea: the right tool for each step

A process is compiled into four kinds of steps, and the compiler decides which tool does what:

| Step | Handled by | Used for | Why |
|---|---|---|---|
| **condition** | plain code | amounts, thresholds, missing fields | deterministic and testable; a decision model can't do arithmetic reliably |
| **decide** | [Jev](https://typesafe.ai) (TypeSafe's decision model) | judgment calls on text: *is this fraud? is the customer vulnerable?* | returns a probability for every option in ~0.5 s, for a fraction of a cent |
| **write** | LLM (gpt-4o-mini) | drafting a reply or a request for missing information | the only step that needs language generation |
| **outcome** | — | where the item ends up | |

**When Jev isn't sure enough, a person decides.** Every decide step has a confidence threshold
(adjustable in the UI); below it the item goes to human review instead of following the answer.

## What makes it trustworthy

- **The LLM's workflow is never trusted as-is.** Every draft is parsed and validated — steps exist,
  no loops, every path ends in an allowed outcome, numbers are compared in code, option descriptions
  are concrete, a write step exists when the process asks for text — and any problems are sent back
  to the LLM to fix (up to 4 attempts). The build log in the UI shows this repair loop live.
- **Drafts are grounded.** The writer may only use facts from the inbox's knowledge base; for
  anything else it says a colleague will follow up rather than inventing opening hours or rates.
- **Measured, not claimed.** Each sample inbox has a reference outcome for every item, so every run
  reports automation rate, accuracy on automated items, cost and time.
- **Safe for a public demo.** The expected outcome never reaches the models, user text is treated as
  data, requests are rate-limited per visitor.

## Results (reference policies, gpt-4o-mini + jev-1.13)

| Inbox | Handled automatically | Correct when automated | Cost per run | Time |
|---|---|---|---|---|
| Accounts payable (16 invoices) | 100% | 100% | ~$0.0005 | ~5 s |
| Bank customer support (16 messages, 2 Dutch) | 88–100% | 93–100% | ~$0.001 | ~12 s |

Compiling a workflow takes ~10–15 s and ~$0.001, usually with 1–2 self-repair rounds. The app
opens each inbox on a saved reference workflow (`backend/app/reference/`), so a visitor can run it
straight away.

## Build your own

Open **Your projects → New project** and bring a sample of a client's inbox:

1. **Items** — upload a CSV or paste rows from a spreadsheet (up to 50). Mark each column as a text
   field, a number field, the right outcome, or ignore it. A right-outcome column makes every run
   report accuracy against your labels.
2. **Outcomes** — where items can end up, each with a plain description. Unsure items always go to a
   person, so that outcome is built in.
3. **Facts** — optional; the only information drafted text may use.

Then describe the process, build it, run it on the examples, and click any step on the canvas to edit
it (each edit is validated by the server before it is kept). Projects are stored in your browser
only — **Export** saves one as a JSON file and **Import** loads it on another machine.

### Publish as an endpoint

**Connect → Publish as endpoint** stores the project's definition and workflow (never the example
items) and returns an endpoint and a secret key. The key is shown to you and kept only as a hash on
the server.

```bash
curl -X POST https://studio.manarattar.com/api/hooks/<project-id>   -H "Content-Type: application/json"   -H "X-Routing-Key: rs_..."   -d '{"employee": "Rae", "message": "Could I take Thursday afternoon off?", "days": 0.5}'
```

```json
{
  "outcome": "approve",
  "needs_person": false,
  "decisions": [{"step": "check_urgent_unusual", "answer": "no", "confidence": 0.78}],
  "drafts": [],
  "steps": [...],
  "cost_usd": 0.000014,
  "latency_ms": 640
}
```

| Endpoint | What it does |
|---|---|
| `POST /api/projects` | Publish `{project, workflow}` → `{id, api_key, endpoint}` |
| `PUT /api/projects/{id}` | Replace the published workflow (`X-Routing-Key`) |
| `DELETE /api/projects/{id}` | Unpublish and delete its call log (`X-Routing-Key`) |
| `POST /api/hooks/{id}` | Run one item (JSON object with the project's fields) |
| `GET /api/projects/{id}/runs` | The last calls, for checking what the endpoint did |

Limits: 100 items a day per endpoint, 16 KB per item; the call log keeps the last 100 calls for at
most 30 days. A wrong key and an unknown project return the same 401, so ids can't be probed.

## Run it locally

```bash
# backend
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # or .venv/bin/pip
echo "OPENAI_API_KEY=sk-..." > .env
echo "TYPESAFE_API_KEY=apikey_..." >> .env
.venv/Scripts/python -m uvicorn app.main:app --port 8000
.venv/Scripts/python -m pytest tests          # 50 tests, no network needed

# frontend
cd frontend
npm install
npm run dev                                    # http://localhost:5173, proxies /api to :8000
```

## Stack

FastAPI · Server-Sent Events · pydantic · OpenAI (gpt-4o-mini) · Jev via REST · React 18 · Vite ·
Tailwind CSS 4 · React Flow + dagre · IBM Plex · Docker · Caddy

## Project layout

```
backend/app/
  models.py     workflow language + validator
  compiler.py   plain language -> validated workflow, self-repair loop (streamed)
  executor.py   runs items: code / Jev / LLM per step, confidence gating, summary metrics
  datasets.py   two sample inboxes with reference outcomes and knowledge bases
  specs.py      your own project definitions, validated
  store.py      SQLite for published projects: hashed keys, short call log
  main.py       API: datasets, compile/run (SSE), validate, publish, webhook, rate limits
frontend/src/
  App.jsx                      studio layout and state
  components/WorkflowCanvas    live graph with per-step traffic counts
  components/ProcessPanel      description, knowledge base, live build log
  components/InboxPanel        inbox, per-item trace, "test your own"
  components/StepEditor        edit any step, validated by the server
  components/NewProject        CSV / pasted rows -> fields, outcomes, facts
  components/ConnectPanel      publish, keys, curl/Python examples, recent calls
  projects.js                  projects in localStorage, export / import
```
