"""Changing a workflow by request, and asking about results. The LLM is faked."""
import json

from app import assistant, compiler, main
from fastapi.testclient import TestClient
from tests.test_projects import PROJECT, WORKFLOW

client = TestClient(main.app)


def setup_function():
    main._calls.clear()


def fake_llm(module, monkeypatch, replies, seen=None):
    replies = list(replies)

    def fake_chat(messages, json_mode=False, max_tokens=None):
        if seen is not None:
            seen.append(messages[-1]["content"])
        return {
            "text": replies.pop(0),
            "input_tokens": 100,
            "output_tokens": 50,
            "latency_ms": 5,
        }

    monkeypatch.setattr(module, "chat", fake_chat)


def stages(response):
    return [
        json.loads(l[6:]) for l in response.text.splitlines() if l.startswith("data: ")
    ]


class TestRevise:
    def test_change_is_applied_with_its_summary(self, monkeypatch):
        changed = json.loads(json.dumps(WORKFLOW))
        changed["nodes"][0]["value"] = 3
        seen = []
        fake_llm(
            compiler,
            monkeypatch,
            [json.dumps({"changes": ["Lowered the limit to 3 days."], **changed})],
            seen,
        )
        events = stages(
            client.post(
                "/api/revise",
                json={
                    "project": PROJECT,
                    "workflow": WORKFLOW,
                    "request": "manager review above 3 days",
                },
            )
        )
        done = events[-1]
        assert done["stage"] == "done"
        assert done["result"]["changes"] == ["Lowered the limit to 3 days."]
        assert done["result"]["workflow"]["nodes"][0]["value"] == 3
        # the LLM was shown the current workflow, not asked to start over
        assert '"id": "long"' in seen[0] and "manager review above 3 days" in seen[0]

    def test_broken_revision_is_repaired(self, monkeypatch):
        broken = json.loads(json.dumps(WORKFLOW))
        broken["nodes"][0]["if_true"] = "nowhere"
        fake_llm(
            compiler,
            monkeypatch,
            [json.dumps(broken), json.dumps({"changes": ["ok"], **WORKFLOW})],
        )
        events = stages(
            client.post(
                "/api/revise",
                json={"project": PROJECT, "workflow": WORKFLOW, "request": "tidy up"},
            )
        )
        assert [e["stage"] for e in events] == [
            "drafting",
            "problems",
            "drafting",
            "done",
        ]

    def test_invalid_current_workflow_is_refused(self):
        bad = json.loads(json.dumps(WORKFLOW))
        bad["start"] = "nowhere"
        r = client.post(
            "/api/revise", json={"project": PROJECT, "workflow": bad, "request": "x"}
        )
        assert r.status_code == 422


class TestAsk:
    def test_answer_uses_the_item_trace(self, monkeypatch):
        seen = []
        fake_llm(
            assistant,
            monkeypatch,
            ["It went to a person because Jev was only 20% sure."],
            seen,
        )
        trace = {
            "title": "Two days off",
            "outcome": "human_review",
            "expected": "approve",
            "steps": [
                {
                    "node": "unusual",
                    "kind": "jev",
                    "choice": "yes",
                    "confidence": 0.2,
                    "threshold": 0.4,
                    "confident": False,
                    "probabilities": {"yes": 0.6, "no": 0.4},
                }
            ],
        }
        r = client.post(
            "/api/ask",
            json={
                "project": PROJECT,
                "workflow": WORKFLOW,
                "question": "Why did this go to a person?",
                "item_result": trace,
            },
        )
        assert r.status_code == 200
        assert "20% sure" in r.json()["answer"]
        assert '"confidence": 0.2' in seen[0] and '"threshold": 0.4' in seen[0]

    def test_question_is_required(self):
        r = client.post(
            "/api/ask", json={"project": PROJECT, "workflow": WORKFLOW, "question": ""}
        )
        assert r.status_code == 422
