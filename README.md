# Workflow Studio

**Describe a business process in plain words — watch it become a working AI workflow, run it on a
real inbox, and see how much it automates, how accurate it is, and what it costs.**

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

Compiling a workflow takes ~10–15 s and ~$0.001, usually with 1–2 self-repair rounds.

## Run it locally

```bash
# backend
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # or .venv/bin/pip
echo "OPENAI_API_KEY=sk-..." > .env
echo "TYPESAFE_API_KEY=apikey_..." >> .env
.venv/Scripts/python -m uvicorn app.main:app --port 8000
.venv/Scripts/python -m pytest tests          # 26 tests, no network needed

# frontend
cd frontend
npm install
npm run dev                                    # http://localhost:5173, proxies /api to :8000
```

## Stack

FastAPI · Server-Sent Events · pydantic · OpenAI (gpt-4o-mini) · Jev via REST · React 18 · Vite ·
Tailwind CSS 4 · React Flow + dagre · Docker · Caddy

## Project layout

```
backend/app/
  models.py     workflow language + validator
  compiler.py   plain language -> validated workflow, self-repair loop (streamed)
  executor.py   runs items: code / Jev / LLM per step, confidence gating, summary metrics
  datasets.py   two sample inboxes with reference outcomes and knowledge bases
  main.py       API: datasets, compile (SSE), run (SSE), rate limiting
frontend/src/
  App.jsx                      studio layout and state
  components/WorkflowCanvas    live graph with per-step traffic counts
  components/ProcessPanel      description, knowledge base, live build log
  components/InboxPanel        inbox, per-item trace, "test your own"
  components/StepInspector     Jev question/options and the confidence threshold
```
