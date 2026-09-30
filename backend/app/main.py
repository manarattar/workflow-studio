import json
import time
from collections import defaultdict, deque

from app import store
from app.assistant import MAX_QUESTION_CHARS, explain
from app.compiler import MAX_DESCRIPTION_CHARS, compile_steps, revise_steps
from app.datasets import DATASETS
from app.executor import run_item, run_items
from app.models import HUMAN_REVIEW, Workflow, validate_workflow
from app.specs import ProjectSpec, clean_item
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError
from starlette.concurrency import run_in_threadpool

app = FastAPI(
    title="Routing Slip API",
    description="Plain-language process -> workflow that runs on code, Jev and an LLM",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# A public demo spends real API credit, so each visitor gets a small budget per hour.
RATE_LIMITS = {"compile": 20, "run": 30, "publish": 20, "ask": 60}
_calls: dict = defaultdict(deque)

# A published endpoint may be called at most this often per day (the run log keeps
# the last 100 calls, so the quota can be counted from it).
HOOK_DAILY_QUOTA = 100
MAX_HOOK_BODY = 16_000


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (
        request.client.host if request.client else "?"
    )


def _check_rate(request: Request, action: str) -> None:
    now = time.time()
    calls = _calls[(_client_ip(request), action)]
    while calls and now - calls[0] > 3600:
        calls.popleft()
    if len(calls) >= RATE_LIMITS[action]:
        raise HTTPException(
            429,
            f"Demo limit reached ({RATE_LIMITS[action]} per hour). Try again later.",
        )
    calls.append(now)


def _resolve(dataset_id: str | None, project: dict | None) -> dict:
    """A built-in sample inbox, or the user's own project spec in the same shape."""
    if project is not None:
        try:
            return ProjectSpec.model_validate(project).as_dataset()
        except ValidationError as error:
            messages = [e["msg"].removeprefix("Value error, ") for e in error.errors()]
            raise HTTPException(
                422, {"message": "The project isn't valid", "problems": messages}
            )
    if dataset_id in DATASETS:
        return DATASETS[dataset_id]
    raise HTTPException(404, f"Unknown dataset '{dataset_id}'")


def _checked_workflow(raw: dict, dataset: dict) -> Workflow:
    try:
        workflow = Workflow.model_validate(raw)
    except ValidationError as error:
        raise HTTPException(
            422, {"message": "Invalid workflow", "problems": [str(error)[:300]]}
        )
    problems = validate_workflow(workflow, dataset["fields"], list(dataset["outcomes"]))
    if problems:
        raise HTTPException(422, {"message": "Invalid workflow", "problems": problems})
    return workflow


def _sse(events):
    def stream():
        for event in events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


class CompileRequest(BaseModel):
    dataset_id: str | None = None
    project: dict | None = None
    description: str = Field(max_length=MAX_DESCRIPTION_CHARS)


class RunRequest(BaseModel):
    dataset_id: str | None = None
    project: dict | None = None
    workflow: dict
    # run one pasted item instead of the whole inbox
    custom_item: dict | None = None


class ValidateRequest(BaseModel):
    dataset_id: str | None = None
    project: dict | None = None
    workflow: dict


class PublishRequest(BaseModel):
    project: dict
    workflow: dict


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/datasets")
def datasets():
    keys = (
        "id",
        "name",
        "blurb",
        "fields",
        "outcomes",
        "template",
        "knowledge",
        "reference_workflow",
        "items",
        "noun",
        "display",
    )
    return [{k: d[k] for k in keys} for d in DATASETS.values()]


@app.post("/api/compile")
def compile_endpoint(body: CompileRequest, request: Request):
    """Streams the build log: drafting, problems found and fixed, then the workflow."""
    dataset = _resolve(body.dataset_id, body.project)
    _check_rate(request, "compile")
    return _sse(compile_steps(body.description, dataset))


@app.post("/api/run")
def run_endpoint(body: RunRequest, request: Request):
    dataset = _resolve(body.dataset_id, body.project)
    # the browser can edit any step, so a workflow is re-checked before it runs
    workflow = _checked_workflow(body.workflow, dataset)

    if body.custom_item is not None:
        item, problems = clean_item(body.custom_item, dataset["fields"])
        if problems:
            raise HTTPException(400, " ".join(problems))
        items = [{"id": "custom", **item}]
    else:
        items = dataset["items"]
        if not items:
            raise HTTPException(
                400, "Add some example items to the project before running it."
            )
    _check_rate(request, "run")
    return _sse(
        run_items(workflow, items, dataset["fields"], dataset.get("knowledge", []))
    )


class ReviseRequest(BaseModel):
    dataset_id: str | None = None
    project: dict | None = None
    workflow: dict
    request: str = Field(max_length=MAX_DESCRIPTION_CHARS)


class AskRequest(BaseModel):
    dataset_id: str | None = None
    project: dict | None = None
    workflow: dict
    question: str = Field(min_length=1, max_length=MAX_QUESTION_CHARS)
    # one item's trace from a run, when the question is about that item
    item_result: dict | None = None
    summary: dict | None = None


@app.post("/api/revise")
def revise_endpoint(body: ReviseRequest, request: Request):
    """Streams a change to the current workflow: drafting, problems fixed, then the new version."""
    dataset = _resolve(body.dataset_id, body.project)
    current = _checked_workflow(body.workflow, dataset)
    _check_rate(request, "compile")
    return _sse(revise_steps(current.model_dump(), body.request, dataset))


@app.post("/api/ask")
def ask_endpoint(body: AskRequest, request: Request):
    """Explain the workflow or one item's result, from the actual trace."""
    dataset = _resolve(body.dataset_id, body.project)
    workflow = _checked_workflow(body.workflow, dataset)
    if body.item_result is not None and len(json.dumps(body.item_result)) > 30_000:
        raise HTTPException(413, "That item's trace is too large to explain.")
    _check_rate(request, "ask")
    return explain(
        body.question, workflow.model_dump(), dataset, body.item_result, body.summary
    )


@app.post("/api/validate")
def validate_endpoint(body: ValidateRequest):
    """Checks an edited workflow without running it - used by the canvas editor."""
    dataset = _resolve(body.dataset_id, body.project)
    try:
        workflow = Workflow.model_validate(body.workflow)
    except ValidationError as error:
        return {"problems": [e["msg"] for e in error.errors()][:5]}
    return {
        "problems": validate_workflow(
            workflow, dataset["fields"], list(dataset["outcomes"])
        )
    }


# ---- published projects: a workflow behind an endpoint, no account needed ----


def _public_spec(project: dict) -> dict:
    """What the server keeps: the definition, never the example items."""
    return {k: project[k] for k in ("name", "fields", "outcomes", "knowledge")}


def _authorised(project_id: str, key: str | None) -> dict:
    project = store.get_project(project_id, key)
    if project is None:
        # same answer for "no such project" and "wrong key", so ids can't be probed
        raise HTTPException(401, "Unknown project or wrong X-Routing-Key.")
    return project


@app.post("/api/projects")
def publish(body: PublishRequest, request: Request):
    dataset = _resolve(None, {**body.project, "items": []})
    workflow = _checked_workflow(body.workflow, dataset)
    _check_rate(request, "publish")
    project_id, key = store.create_project(_public_spec(dataset), workflow.model_dump())
    return {"id": project_id, "api_key": key, "endpoint": f"/api/hooks/{project_id}"}


@app.put("/api/projects/{project_id}")
def update(
    project_id: str, body: PublishRequest, x_routing_key: str | None = Header(None)
):
    _authorised(project_id, x_routing_key)
    dataset = _resolve(None, {**body.project, "items": []})
    workflow = _checked_workflow(body.workflow, dataset)
    store.update_project(project_id, _public_spec(dataset), workflow.model_dump())
    return {"id": project_id, "updated": True}


@app.delete("/api/projects/{project_id}")
def unpublish(project_id: str, x_routing_key: str | None = Header(None)):
    _authorised(project_id, x_routing_key)
    store.delete_project(project_id)
    return {"id": project_id, "deleted": True}


@app.get("/api/projects/{project_id}/runs")
def runs(project_id: str, x_routing_key: str | None = Header(None)):
    _authorised(project_id, x_routing_key)
    return {"runs": store.recent_runs(project_id)}


@app.post("/api/hooks/{project_id}")
async def hook(
    project_id: str, request: Request, x_routing_key: str | None = Header(None)
):
    """Run one item through a published workflow and return the decision."""
    project = _authorised(project_id, x_routing_key)
    raw = await request.body()
    if len(raw) > MAX_HOOK_BODY:
        raise HTTPException(413, f"The item is larger than {MAX_HOOK_BODY // 1000} KB.")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "Send the item as a JSON object.")
    if not isinstance(payload, dict):
        raise HTTPException(400, "Send the item as a JSON object.")

    spec = project["spec"]
    item, problems = clean_item(payload, spec["fields"])
    if problems:
        raise HTTPException(400, " ".join(problems))
    midnight = time.time() - time.time() % 86400
    if store.runs_since(project_id, midnight) >= HOOK_DAILY_QUOTA:
        raise HTTPException(
            429,
            f"This endpoint has reached its limit of {HOOK_DAILY_QUOTA} items today.",
        )

    workflow = Workflow.model_validate(project["workflow"])
    # model calls block, so they run in a worker thread, not on the event loop
    result = await run_in_threadpool(
        run_item,
        workflow,
        {"id": "hook", **item},
        spec["fields"],
        spec.get("knowledge", []),
    )
    response = {
        "outcome": result["outcome"],
        "needs_person": result["outcome"] == HUMAN_REVIEW,
        "decisions": [
            {
                "step": s["node"],
                "answer": s.get("choice"),
                "confidence": s.get("confidence"),
            }
            for s in result["steps"]
            if s["kind"] == "jev"
        ],
        "drafts": [s["text"] for s in result["steps"] if s["kind"] == "llm"],
        "steps": result["steps"],
        "cost_usd": round(result["cost_usd"], 6),
        "latency_ms": result["latency_ms"],
    }
    text = " | ".join(str(v) for v in item.values() if v not in (None, ""))
    store.log_run(project_id, text, response)
    return response
