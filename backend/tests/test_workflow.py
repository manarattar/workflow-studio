"""
Tests for the workflow language, executor, compiler repair loop and API.
No network: Jev and the LLM are faked, so these run without keys.
"""
import json

import pytest
from app import compiler, executor
from app.datasets import DATASETS
from app.models import HUMAN_REVIEW, Workflow, validate_workflow
from fastapi.testclient import TestClient

AP = DATASETS["accounts_payable"]


def ap_workflow(min_confidence=None):
    """The accounts-payable policy written by hand: fraud? -> PO missing? -> amount."""
    fraud = {
        "type": "decide",
        "id": "fraud",
        "label": "Fraud?",
        "kind": "yes_no",
        "question": "Does this invoice email look like fraud?",
        "options": {
            "yes": "It asks to pay a new bank account or pressures us to pay urgently",
            "no": "It is an ordinary invoice from a supplier with no warning signs",
        },
        "routes": {"yes": "blocked", "no": "po_missing"},
    }
    if min_confidence is not None:
        fraud["min_confidence"] = min_confidence
    return Workflow.model_validate(
        {
            "name": "Invoices",
            "start": "fraud",
            "nodes": [
                fraud,
                {
                    "type": "condition",
                    "id": "po_missing",
                    "label": "PO missing?",
                    "field": "po_number",
                    "operator": "is_empty",
                    "if_true": "ask_po",
                    "if_false": "big",
                },
                {
                    "type": "write",
                    "id": "ask_po",
                    "label": "Ask for PO",
                    "instructions": "Ask for the PO.",
                    "next": "missing",
                },
                {
                    "type": "condition",
                    "id": "big",
                    "label": "Over 1000?",
                    "field": "amount_eur",
                    "operator": ">",
                    "value": 1000,
                    "if_true": "approval",
                    "if_false": "pay",
                },
                {
                    "type": "outcome",
                    "id": "blocked",
                    "label": "Blocked",
                    "outcome": "block_fraud",
                },
                {
                    "type": "outcome",
                    "id": "missing",
                    "label": "Ask supplier",
                    "outcome": "request_missing_info",
                },
                {
                    "type": "outcome",
                    "id": "approval",
                    "label": "Manager",
                    "outcome": "manager_approval",
                },
                {
                    "type": "outcome",
                    "id": "pay",
                    "label": "Pay",
                    "outcome": "pay_automatically",
                },
            ],
        }
    )


def check(wf):
    return validate_workflow(wf, AP["fields"], list(AP["outcomes"]))


class TestValidation:
    def test_hand_written_workflow_is_valid(self):
        assert check(ap_workflow()) == []

    def test_unknown_step_reference(self):
        wf = ap_workflow()
        wf.nodes[0].routes["yes"] = "nowhere"
        assert any("does not exist" in p for p in check(wf))

    def test_unknown_field(self):
        wf = ap_workflow()
        wf.nodes[1].field = "colour"
        assert any("checks field 'colour'" in p for p in check(wf))

    def test_numeric_comparison_on_text_field(self):
        wf = ap_workflow()
        wf.nodes[3].field = "subject"
        assert any("as a number" in p for p in check(wf))

    def test_outcome_not_allowed(self):
        wf = ap_workflow()
        wf.nodes[-1].outcome = "send_to_mars"
        assert any("allowed outcomes" in p for p in check(wf))

    def test_cycle_is_rejected(self):
        wf = ap_workflow()
        wf.nodes[3].if_false = "fraud"
        assert any("loops back" in p for p in check(wf))

    def test_unreachable_step(self):
        wf = ap_workflow()
        wf.nodes.append(wf.nodes[-1].model_copy(update={"id": "orphan"}))
        assert any("never be reached" in p for p in check(wf))

    def test_yes_no_needs_exactly_yes_and_no(self):
        wf = ap_workflow()
        wf.nodes[0].options = {"maybe": "x", "no": "y"}
        wf.nodes[0].routes = {"maybe": "blocked", "no": "po_missing"}
        assert any("exactly 'yes' and 'no'" in p for p in check(wf))


@pytest.fixture
def fake_models(monkeypatch):
    """Jev answers from a per-message table; the LLM returns a fixed draft."""
    answers = {}

    def fake_ask_jev(state, questions):
        return {
            "answers": {"q": {"type": "noul", "noul": answers[state["subject"]]}},
            "usage": {"input_tokens": 100},
            "latency_ms": 5,
        }

    def fake_chat(messages, json_mode=False, max_tokens=None):
        return {
            "text": "Could you send the PO number?",
            "input_tokens": 50,
            "output_tokens": 10,
            "latency_ms": 5,
        }

    monkeypatch.setattr(executor, "ask_jev", fake_ask_jev)
    monkeypatch.setattr(executor, "chat", fake_chat)
    return answers


def item(subject, amount, po, expected=None):
    return {
        "id": subject,
        "sender": "a@b.nl",
        "subject": subject,
        "body": "...",
        "amount_eur": amount,
        "po_number": po,
        "expected": expected,
    }


class TestExecutor:
    def test_code_handles_the_numbers(self, fake_models):
        fake_models["small"] = 0.05
        fake_models["large"] = 0.05
        wf = ap_workflow()
        assert (
            executor.run_item(wf, item("small", 200, "PO-1"), AP["fields"])["outcome"]
            == "pay_automatically"
        )
        assert (
            executor.run_item(wf, item("large", 5000, "PO-1"), AP["fields"])["outcome"]
            == "manager_approval"
        )

    def test_fraud_is_blocked(self, fake_models):
        fake_models["scam"] = 0.97
        result = executor.run_item(
            ap_workflow(), item("scam", 200, "PO-1", "block_fraud"), AP["fields"]
        )
        assert result["outcome"] == "block_fraud"
        assert result["correct"] is True

    def test_unsure_answer_goes_to_a_person(self, fake_models):
        fake_models["hmm"] = 0.6  # confidence |2*0.6-1| = 0.2, below the 0.4 default
        result = executor.run_item(
            ap_workflow(), item("hmm", 200, "PO-1"), AP["fields"]
        )
        assert result["outcome"] == HUMAN_REVIEW
        assert result["steps"][0]["confident"] is False

    def test_threshold_can_be_lowered(self, fake_models):
        # the same 60% "yes, fraud" answer is acted on once the bar is lower
        fake_models["hmm"] = 0.6
        result = executor.run_item(
            ap_workflow(min_confidence=0.1), item("hmm", 200, "PO-1"), AP["fields"]
        )
        assert result["outcome"] == "block_fraud"

    def test_write_step_records_the_draft(self, fake_models):
        fake_models["no po"] = 0.02
        result = executor.run_item(ap_workflow(), item("no po", 200, ""), AP["fields"])
        assert result["outcome"] == "request_missing_info"
        assert any(
            s["kind"] == "llm" and "PO number" in s["text"] for s in result["steps"]
        )

    def test_writer_gets_the_knowledge_base(self, fake_models, monkeypatch):
        prompts = []

        def spy_chat(messages, json_mode=False, max_tokens=None):
            prompts.append(messages[-1]["content"])
            return {
                "text": "ok",
                "input_tokens": 1,
                "output_tokens": 1,
                "latency_ms": 1,
            }

        monkeypatch.setattr(executor, "chat", spy_chat)
        fake_models["no po"] = 0.02
        executor.run_item(
            ap_workflow(),
            item("no po", 200, ""),
            AP["fields"],
            ["Invoices are paid in 30 days."],
        )
        assert "Invoices are paid in 30 days." in prompts[0]

    def test_expected_outcome_never_reaches_the_models(self, fake_models, monkeypatch):
        seen = []

        def spy(state, questions):
            seen.append(state)
            return {
                "answers": {"q": {"type": "noul", "noul": 0.01}},
                "usage": {},
                "latency_ms": 1,
            }

        monkeypatch.setattr(executor, "ask_jev", spy)
        executor.run_item(
            ap_workflow(), item("x", 10, "PO-1", "pay_automatically"), AP["fields"]
        )
        assert "expected" not in seen[0] and "id" not in seen[0]

    def test_jev_failure_falls_back_to_a_person(self, monkeypatch):
        def down(state, questions):
            raise ConnectionError("unreachable")

        monkeypatch.setattr(executor, "ask_jev", down)
        result = executor.run_item(ap_workflow(), item("x", 10, "PO-1"), AP["fields"])
        assert result["outcome"] == HUMAN_REVIEW

    def test_summary_counts(self, fake_models):
        fake_models.update({"a": 0.02, "b": 0.98, "c": 0.55})
        items = [
            item("a", 10, "PO-1", "pay_automatically"),
            item("b", 10, "PO-1", "block_fraud"),
            item("c", 10, "PO-1", "pay_automatically"),
        ]
        events = list(executor.run_items(ap_workflow(), items, AP["fields"]))
        summary = events[-1]
        assert summary["event"] == "summary"
        assert summary["automated"] == 2 and summary["human_review"] == 1
        assert summary["accuracy_automated"] == 1.0
        assert summary["accuracy"] == round(2 / 3, 3)


class TestCompilerRepairLoop:
    def test_invalid_then_valid(self, monkeypatch):
        broken = ap_workflow().model_dump()
        broken["nodes"][0]["routes"]["yes"] = "nowhere"
        replies = [json.dumps(broken), ap_workflow().model_dump_json()]
        prompts = []

        def fake_chat(messages, json_mode=False, max_tokens=None):
            prompts.append(messages[-1]["content"])
            return {
                "text": replies.pop(0),
                "input_tokens": 1000,
                "output_tokens": 300,
                "latency_ms": 10,
            }

        monkeypatch.setattr(compiler, "chat", fake_chat)
        result = compiler.compile_workflow(AP["template"], AP)
        assert result["attempts"] == 2
        assert "does not exist" in prompts[1]  # the problem was fed back
        assert result["repairs"] and "does not exist" in result["repairs"][0][0]

    def test_gives_up_with_the_problems(self, monkeypatch):
        monkeypatch.setattr(
            compiler,
            "chat",
            lambda *a, **k: {
                "text": "not json",
                "input_tokens": 1,
                "output_tokens": 1,
                "latency_ms": 1,
            },
        )
        with pytest.raises(compiler.CompileError) as error:
            compiler.compile_workflow(AP["template"], AP)
        assert error.value.problems

    def test_vague_options_and_missing_write_are_flagged(self):
        wf = ap_workflow()
        wf.nodes[0].options = {"yes": "Fraud", "no": "Not fraud"}
        wf.nodes = [n for n in wf.nodes if n.type != "write"]
        problems = compiler._intent_problems("draft a reply to the supplier", wf, AP)
        assert any("too vague" in p for p in problems)
        assert any("no write step" in p for p in problems)

    def test_emptiness_check_on_always_filled_field(self):
        wf = ap_workflow()
        wf.nodes[1].field = "body"
        assert any("always filled" in p for p in compiler._intent_problems("", wf, AP))


class TestApi:
    def setup_method(self):
        from app.main import _calls, app

        _calls.clear()
        self.client = TestClient(app)

    def test_datasets(self):
        body = self.client.get("/api/datasets").json()
        assert {d["id"] for d in body} == {"accounts_payable", "bank_support"}

    def test_run_streams_items_then_summary(self, fake_models):
        fake_models["only"] = 0.02
        response = self.client.post(
            "/api/run",
            json={
                "dataset_id": "accounts_payable",
                "workflow": ap_workflow().model_dump(),
                "custom_item": {
                    "sender": "a@b.nl",
                    "subject": "only",
                    "body": "hi",
                    "amount_eur": 50,
                    "po_number": "PO-9",
                },
            },
        )
        events = [
            json.loads(line[6:])
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]
        assert [e["event"] for e in events] == ["item", "summary"]
        assert events[0]["outcome"] == "pay_automatically"

    def test_invalid_workflow_rejected_before_running(self):
        wf = ap_workflow().model_dump()
        wf["start"] = "nowhere"
        response = self.client.post(
            "/api/run", json={"dataset_id": "accounts_payable", "workflow": wf}
        )
        assert response.status_code == 422

    def test_rate_limit(self, monkeypatch):
        from app import main

        monkeypatch.setitem(main.RATE_LIMITS, "compile", 1)
        monkeypatch.setattr(
            main, "compile_steps", lambda d, ds: iter([{"stage": "done", "result": {}}])
        )
        body = {"dataset_id": "accounts_payable", "description": "pay invoices"}
        assert self.client.post("/api/compile", json=body).status_code == 200
        assert self.client.post("/api/compile", json=body).status_code == 429

    def test_compile_streams_the_repair_log(self, monkeypatch):
        broken = ap_workflow().model_dump()
        broken["start"] = "nowhere"
        replies = [json.dumps(broken), ap_workflow().model_dump_json()]
        monkeypatch.setattr(
            compiler,
            "chat",
            lambda *a, **k: {
                "text": replies.pop(0),
                "input_tokens": 1,
                "output_tokens": 1,
                "latency_ms": 1,
            },
        )
        body = {"dataset_id": "accounts_payable", "description": AP["template"]}
        text = self.client.post("/api/compile", json=body).text
        stages = [
            json.loads(line[6:])["stage"]
            for line in text.splitlines()
            if line.startswith("data: ")
        ]
        assert stages == ["drafting", "problems", "drafting", "done"]
