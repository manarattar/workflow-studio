"""
Custom projects, the validate endpoint, and published webhooks.
No network: Jev and the LLM are faked, and the database is a temp file.
"""
import json

import pytest
from app import executor, main, store
from app.specs import ProjectSpec
from fastapi.testclient import TestClient

PROJECT = {
    "name": "Leave requests",
    "fields": {"employee": "text", "message": "text", "days": "number"},
    "outcomes": {
        "approve": "A normal leave request within policy",
        "manager_review": "A long or unusual request that a manager must look at",
    },
    "knowledge": ["Employees have 25 leave days per year."],
    "items": [
        {
            "employee": "Sam",
            "message": "Two days off next week please",
            "days": 2,
            "expected": "approve",
        },
        {
            "employee": "Ana",
            "message": "I'd like three weeks in August",
            "days": 15,
            "expected": "manager_review",
        },
    ],
}

WORKFLOW = {
    "name": "Leave",
    "start": "long",
    "nodes": [
        {
            "type": "condition",
            "id": "long",
            "label": "More than 5 days?",
            "field": "days",
            "operator": ">",
            "value": 5,
            "if_true": "review",
            "if_false": "unusual",
        },
        {
            "type": "decide",
            "id": "unusual",
            "label": "Unusual?",
            "kind": "yes_no",
            "question": "Is anything unusual about this request?",
            "options": {
                "yes": "It mentions something out of the ordinary, like a conflict",
                "no": "It is a plain request for a few days off",
            },
            "routes": {"yes": "review", "no": "ok"},
        },
        {
            "type": "outcome",
            "id": "review",
            "label": "Manager",
            "outcome": "manager_review",
        },
        {"type": "outcome", "id": "ok", "label": "Approve", "outcome": "approve"},
    ],
}


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "studio.db"))
    main._calls.clear()

    def fake_jev(state, questions):
        return {
            "answers": {"q": {"type": "noul", "noul": 0.03}},
            "usage": {"input_tokens": 50},
            "latency_ms": 3,
        }

    monkeypatch.setattr(executor, "ask_jev", fake_jev)


client = TestClient(main.app)


class TestProjectSpec:
    def test_valid_project_becomes_a_dataset(self):
        ds = ProjectSpec.model_validate(PROJECT).as_dataset()
        assert ds["fields"] == PROJECT["fields"]
        assert [i["expected"] for i in ds["items"]] == ["approve", "manager_review"]
        assert set(ds["always_filled"]) == {"employee", "message", "days"}

    @pytest.mark.parametrize(
        "change, fragment",
        [
            ({"fields": {"Bad Name": "text"}}, "Field name"),
            ({"fields": {"id": "text"}}, "Field name"),
            ({"outcomes": {"only_one": "x"}}, "2 to 12 outcomes"),
            ({"outcomes": {"approve": "ok", "human_review": "no"}}, "built in"),
            (
                {"items": [{"employee": "x", "message": "y", "days": "many"}]},
                "should be a number",
            ),
            (
                {
                    "items": [
                        {"employee": "x", "message": "y", "days": 1, "expected": "fire"}
                    ]
                },
                "not one of the outcomes",
            ),
            ({"items": [{"employee": "x", "surprise": "y"}]}, "aren't defined"),
        ],
    )
    def test_problems_are_explained(self, change, fragment):
        response = client.post(
            "/api/validate",
            json={"project": {**PROJECT, **change}, "workflow": WORKFLOW},
        )
        assert response.status_code == 422
        assert fragment in " ".join(response.json()["detail"]["problems"])


class TestCustomProjectRuns:
    def test_run_inline_project_with_accuracy(self):
        response = client.post(
            "/api/run", json={"project": PROJECT, "workflow": WORKFLOW}
        )
        events = [
            json.loads(l[6:])
            for l in response.text.splitlines()
            if l.startswith("data: ")
        ]
        summary = events[-1]
        assert summary["event"] == "summary"
        assert summary["accuracy"] == 1.0  # 2 days -> approve, 15 days -> manager

    def test_run_without_items_is_refused(self):
        response = client.post(
            "/api/run", json={"project": {**PROJECT, "items": []}, "workflow": WORKFLOW}
        )
        assert response.status_code == 400

    def test_validate_reports_a_broken_edit(self):
        broken = json.loads(json.dumps(WORKFLOW))
        broken["nodes"][0]["field"] = "salary"
        problems = client.post(
            "/api/validate", json={"project": PROJECT, "workflow": broken}
        ).json()["problems"]
        assert any("salary" in p for p in problems)

    def test_validate_passes_a_good_workflow(self):
        assert client.post(
            "/api/validate", json={"project": PROJECT, "workflow": WORKFLOW}
        ).json() == {"problems": []}


class TestPublishedHooks:
    def publish(self):
        response = client.post(
            "/api/projects", json={"project": PROJECT, "workflow": WORKFLOW}
        )
        assert response.status_code == 200
        return response.json()

    def test_publish_hook_and_recent_runs(self):
        pub = self.publish()
        headers = {"X-Routing-Key": pub["api_key"]}
        result = client.post(
            pub["endpoint"],
            headers=headers,
            json={"employee": "Lee", "message": "One day off Friday", "days": 1},
        ).json()
        assert result["outcome"] == "approve"
        assert result["needs_person"] is False
        assert result["decisions"][0]["answer"] == "no"
        runs = client.get(f"/api/projects/{pub['id']}/runs", headers=headers).json()[
            "runs"
        ]
        assert len(runs) == 1 and runs[0]["outcome"] == "approve"

    def test_example_items_are_not_stored(self):
        pub = self.publish()
        project = store.get_project(pub["id"], pub["api_key"])
        assert "items" not in project["spec"]

    def test_key_is_stored_only_as_a_hash(self, tmp_path):
        pub = self.publish()
        raw = open(store.DB_PATH, "rb").read()
        assert pub["api_key"].encode() not in raw

    def test_wrong_key_and_unknown_project_look_the_same(self):
        pub = self.publish()
        wrong = client.post(
            pub["endpoint"],
            headers={"X-Routing-Key": "rs_nope"},
            json={"message": "hi"},
        )
        unknown = client.post(
            "/api/hooks/doesnotexist",
            headers={"X-Routing-Key": pub["api_key"]},
            json={"message": "hi"},
        )
        assert wrong.status_code == unknown.status_code == 401
        assert wrong.json() == unknown.json()

    def test_bad_item_is_rejected(self):
        pub = self.publish()
        headers = {"X-Routing-Key": pub["api_key"]}
        assert (
            client.post(
                pub["endpoint"], headers=headers, json={"days": "lots"}
            ).status_code
            == 400
        )
        assert (
            client.post(pub["endpoint"], headers=headers, content=b"[1,2]").status_code
            == 400
        )
        big = {"message": "x" * 20_000}
        assert (
            client.post(pub["endpoint"], headers=headers, json=big).status_code == 413
        )

    def test_daily_quota(self, monkeypatch):
        monkeypatch.setattr(main, "HOOK_DAILY_QUOTA", 2)
        pub = self.publish()
        headers = {"X-Routing-Key": pub["api_key"]}
        item = {"employee": "Lee", "message": "One day", "days": 1}
        assert (
            client.post(pub["endpoint"], headers=headers, json=item).status_code == 200
        )
        assert (
            client.post(pub["endpoint"], headers=headers, json=item).status_code == 200
        )
        assert (
            client.post(pub["endpoint"], headers=headers, json=item).status_code == 429
        )

    def test_update_and_unpublish(self):
        pub = self.publish()
        headers = {"X-Routing-Key": pub["api_key"]}
        changed = json.loads(json.dumps(WORKFLOW))
        changed["nodes"][0]["value"] = 1
        assert (
            client.put(
                f"/api/projects/{pub['id']}",
                headers=headers,
                json={"project": PROJECT, "workflow": changed},
            ).status_code
            == 200
        )
        result = client.post(
            pub["endpoint"],
            headers=headers,
            json={"employee": "Lee", "message": "Two days", "days": 2},
        ).json()
        assert (
            result["outcome"] == "manager_review"
        )  # now more than 1 day needs a manager
        assert (
            client.delete(f"/api/projects/{pub['id']}", headers=headers).status_code
            == 200
        )
        assert (
            client.post(
                pub["endpoint"], headers=headers, json={"message": "hi"}
            ).status_code
            == 401
        )

    def test_run_log_is_capped(self, monkeypatch):
        monkeypatch.setattr(store, "KEEP_RUNS", 3)
        pub = self.publish()
        headers = {"X-Routing-Key": pub["api_key"]}
        for i in range(5):
            client.post(
                pub["endpoint"],
                headers=headers,
                json={"employee": "Lee", "message": f"day {i}", "days": 1},
            )
        assert len(store.recent_runs(pub["id"], limit=10)) == 3
