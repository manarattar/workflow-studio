import json
import time
from collections import defaultdict, deque

from app.compiler import MAX_DESCRIPTION_CHARS, compile_steps
from app.datasets import DATASETS
from app.executor import run_items
from app.models import Workflow, validate_workflow
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError

app = FastAPI(
    title="Workflow Studio API",
    description="Plain-language process -> workflow that runs on code, Jev and an LLM",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# A public demo spends real API credit, so each visitor gets a small budget per hour.
RATE_LIMITS = {"compile": 20, "run": 30}
_calls: dict = defaultdict(deque)


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


def _dataset(dataset_id: str) -> dict:
    if dataset_id not in DATASETS:
        raise HTTPException(404, f"Unknown dataset '{dataset_id}'")
    return DATASETS[dataset_id]


class CompileRequest(BaseModel):
    dataset_id: str
    description: str = Field(max_length=MAX_DESCRIPTION_CHARS)


class RunRequest(BaseModel):
    dataset_id: str
    workflow: dict
    # run one pasted item instead of the whole sample inbox
    custom_item: dict | None = None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/datasets")
def datasets():
    return [
        {
            k: d[k]
            for k in ("id", "name", "blurb", "fields", "outcomes", "template", "knowledge", "items")
        }
        for d in DATASETS.values()
    ]


@app.post("/api/compile")
def compile_endpoint(body: CompileRequest, request: Request):
    """Streams the build log: drafting, problems found and fixed, then the workflow."""
    dataset = _dataset(body.dataset_id)
    _check_rate(request, "compile")

    def event_stream():
        for event in compile_steps(body.description, dataset):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/run")
def run_endpoint(body: RunRequest, request: Request):
    dataset = _dataset(body.dataset_id)
    try:
        workflow = Workflow.model_validate(body.workflow)
    except ValidationError as error:
        raise HTTPException(422, f"Invalid workflow: {str(error)[:300]}")
    # the browser can edit thresholds, so a workflow is re-checked before it runs
    problems = validate_workflow(workflow, dataset["fields"], list(dataset["outcomes"]))
    if problems:
        raise HTTPException(422, {"message": "Invalid workflow", "problems": problems})

    if body.custom_item is not None:
        item = {k: body.custom_item.get(k) for k in dataset["fields"]}
        text_len = sum(len(str(v or "")) for v in item.values())
        if text_len == 0 or text_len > 4000:
            raise HTTPException(
                400, "Custom item must have some text and at most 4000 characters"
            )
        items = [{"id": "custom", **item}]
    else:
        items = dataset["items"]
    _check_rate(request, "run")

    def event_stream():
        for event in run_items(
            workflow, items, dataset["fields"], dataset.get("knowledge", [])
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
