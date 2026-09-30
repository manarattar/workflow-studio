"""
A user's own inbox definition: which fields an item has, which outcomes exist,
the facts drafts may use, and (optionally) example items with the right outcome.

as_dataset() turns it into the same dict shape as the built-in sample inboxes,
so the compiler and executor run custom projects without any changes.
"""

import re
from typing import Dict, List, Literal

from app.models import HUMAN_REVIEW
from pydantic import BaseModel, Field, model_validator

NAME = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
RESERVED_FIELDS = {"id", "expected"}

MAX_FIELDS = 15
MIN_OUTCOMES, MAX_OUTCOMES = 2, 12
MAX_FACTS, MAX_FACT_CHARS = 30, 300
MAX_ITEMS, MAX_ITEM_CHARS = 50, 4000


class ProjectSpec(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    fields: Dict[str, Literal["text", "number"]]
    outcomes: Dict[str, str]
    knowledge: List[str] = []
    items: List[dict] = []

    @model_validator(mode="after")
    def check(self):
        problems = []
        if not 1 <= len(self.fields) <= MAX_FIELDS:
            problems.append(f"A project needs 1 to {MAX_FIELDS} fields.")
        for name in self.fields:
            if not NAME.match(name) or name in RESERVED_FIELDS:
                problems.append(
                    f"Field name '{name}' must be lowercase letters, digits and underscores, "
                    "start with a letter, and not be 'id' or 'expected'."
                )
        if not MIN_OUTCOMES <= len(self.outcomes) <= MAX_OUTCOMES:
            problems.append(
                f"A project needs {MIN_OUTCOMES} to {MAX_OUTCOMES} outcomes."
            )
        for name, meaning in self.outcomes.items():
            if not NAME.match(name) or name == HUMAN_REVIEW:
                problems.append(
                    f"Outcome name '{name}' must be lowercase letters, digits and underscores, "
                    f"and not '{HUMAN_REVIEW}' (that one is built in)."
                )
            if not meaning.strip() or len(meaning) > 300:
                problems.append(
                    f"Outcome '{name}' needs a meaning of at most 300 characters."
                )
        if len(self.knowledge) > MAX_FACTS or any(
            len(f) > MAX_FACT_CHARS for f in self.knowledge
        ):
            problems.append(
                f"At most {MAX_FACTS} facts of {MAX_FACT_CHARS} characters each."
            )
        if len(self.items) > MAX_ITEMS:
            problems.append(f"At most {MAX_ITEMS} example items per project.")
        for i, item in enumerate(self.items, 1):
            problems += _item_problems(item, self.fields, self.outcomes, f"Item {i}")
        if problems:
            raise ValueError(" ".join(problems))
        return self

    def as_dataset(self) -> dict:
        items = [
            {
                **{k: item.get(k) for k in self.fields},
                "id": str(item.get("id") or f"item-{i}"),
                **({"expected": item["expected"]} if item.get("expected") else {}),
            }
            for i, item in enumerate(self.items, 1)
        ]
        # a field filled on every example can't sensibly be checked for being empty
        always_filled = [
            f
            for f in self.fields
            if items
            and all(
                str(it.get(f) if it.get(f) is not None else "").strip() for it in items
            )
        ]
        return {
            "id": "custom",
            "name": self.name,
            "fields": dict(self.fields),
            "outcomes": dict(self.outcomes),
            "knowledge": list(self.knowledge),
            "always_filled": always_filled,
            "template": "",
            "items": items,
        }


def _item_problems(item: dict, fields: dict, outcomes: dict, where: str) -> list[str]:
    problems = []
    unknown = set(item) - set(fields) - RESERVED_FIELDS
    if unknown:
        problems.append(f"{where} has fields that aren't defined: {sorted(unknown)}.")
    if sum(len(str(v or "")) for k, v in item.items() if k in fields) > MAX_ITEM_CHARS:
        problems.append(f"{where} is longer than {MAX_ITEM_CHARS} characters.")
    for name, kind in fields.items():
        value = item.get(name)
        if kind == "number" and value not in (None, ""):
            try:
                float(value)
            except (TypeError, ValueError):
                problems.append(f"{where}: '{name}' should be a number, got {value!r}.")
    expected = item.get("expected")
    if expected and expected not in outcomes:
        problems.append(
            f"{where}: right outcome '{expected}' is not one of the outcomes."
        )
    return problems


def clean_item(item: dict, fields: dict) -> tuple[dict, list[str]]:
    """Validate one incoming item (e.g. from a webhook) and keep only the project's fields."""
    problems = _item_problems(item, fields, {}, "The item")
    problems = [p for p in problems if "right outcome" not in p]
    cleaned = {}
    for name, kind in fields.items():
        value = item.get(name)
        if kind == "number" and value not in (None, ""):
            try:
                value = float(value)
            except (TypeError, ValueError):
                pass
        cleaned[name] = value
    if not any(str(v or "").strip() for v in cleaned.values()):
        problems.append("The item has no content in any of the project's fields.")
    return cleaned, problems
