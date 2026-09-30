"""
The workflow language the LLM compiles a plain-language process into.

Four step types, each handled by the tool that suits it:
  condition - plain code: numbers, comparisons, missing fields
  decide    - Jev: a judgment call on text, answered with a probability per option
  write     - LLM: drafting text (a reply, a request for missing information)
  outcome   - where an item ends up

A decide step whose answer isn't confident enough sends the item to human
review automatically, so the LLM never has to add review steps itself.
"""

from typing import Annotated, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field

HUMAN_REVIEW = "human_review"

# Below these, Jev's answer is too spread out to act on without a person.
# A yes/no answer's confidence is how far its probability is from 50/50,
# so 0.4 means at least 70/30.
DEFAULT_MIN_CONFIDENCE = {"choice": 0.35, "yes_no": 0.4}


class ConditionNode(BaseModel):
    type: Literal["condition"] = "condition"
    id: str
    label: str
    field: str
    operator: Literal[">", ">=", "<", "<=", "==", "!=", "is_empty", "not_empty"]
    value: Optional[Union[float, str]] = None
    if_true: str
    if_false: str


class DecideNode(BaseModel):
    type: Literal["decide"] = "decide"
    id: str
    label: str
    kind: Literal["choice", "yes_no"]
    question: str
    # option name -> what it means; a yes_no step has exactly "yes" and "no"
    options: Dict[str, str]
    # option name -> id of the next step
    routes: Dict[str, str]
    min_confidence: Optional[float] = None

    @property
    def confidence_threshold(self) -> float:
        if self.min_confidence is not None:
            return self.min_confidence
        return DEFAULT_MIN_CONFIDENCE[self.kind]


class WriteNode(BaseModel):
    type: Literal["write"] = "write"
    id: str
    label: str
    instructions: str
    next: str


class OutcomeNode(BaseModel):
    type: Literal["outcome"] = "outcome"
    id: str
    label: str
    outcome: str


Node = Annotated[
    Union[ConditionNode, DecideNode, WriteNode, OutcomeNode],
    Field(discriminator="type"),
]


class Workflow(BaseModel):
    name: str
    start: str
    nodes: List[Node]

    def node_map(self) -> Dict[str, Node]:
        return {n.id: n for n in self.nodes}


def _next_ids(node) -> List[str]:
    if isinstance(node, ConditionNode):
        return [node.if_true, node.if_false]
    if isinstance(node, DecideNode):
        return list(node.routes.values())
    if isinstance(node, WriteNode):
        return [node.next]
    return []


def validate_workflow(
    workflow: Workflow, fields: Dict[str, str], outcomes: List[str]
) -> List[str]:
    """
    Every problem that would make the workflow unsafe to run, as plain
    sentences - these are fed back to the LLM so it can fix its own output.
    """
    problems = []
    nodes = workflow.node_map()
    if len(nodes) != len(workflow.nodes):
        problems.append("Two steps share the same id; every id must be unique.")
    if workflow.start not in nodes:
        problems.append(f"start '{workflow.start}' is not the id of any step.")

    for node in workflow.nodes:
        for target in _next_ids(node):
            if target not in nodes:
                problems.append(
                    f"Step '{node.id}' points to '{target}', which does not exist."
                )
        if isinstance(node, ConditionNode):
            if node.field not in fields:
                problems.append(
                    f"Step '{node.id}' checks field '{node.field}', but the only fields are "
                    f"{sorted(fields)}."
                )
            numeric = node.operator in (">", ">=", "<", "<=")
            if numeric and fields.get(node.field) != "number":
                problems.append(
                    f"Step '{node.id}' compares '{node.field}' as a number, but it is not one."
                )
            if node.operator not in ("is_empty", "not_empty") and node.value is None:
                problems.append(
                    f"Step '{node.id}' uses '{node.operator}' but gives no value."
                )
        if isinstance(node, DecideNode):
            if node.kind == "yes_no" and set(node.options) != {"yes", "no"}:
                problems.append(
                    f"Step '{node.id}' is yes_no, so its options must be exactly 'yes' and 'no'."
                )
            if node.kind == "choice" and len(node.options) < 2:
                problems.append(
                    f"Step '{node.id}' is a choice with fewer than two options."
                )
            if set(node.routes) != set(node.options):
                problems.append(
                    f"Step '{node.id}' must have exactly one route per option."
                )
        if isinstance(node, OutcomeNode) and node.outcome not in outcomes + [
            HUMAN_REVIEW
        ]:
            problems.append(
                f"Step '{node.id}' ends in outcome '{node.outcome}', but the allowed outcomes are "
                f"{outcomes}."
            )

    if problems:
        return problems

    # no loops, and every path has to end in an outcome
    def walk(node_id: str, trail: tuple):
        if node_id in trail:
            problems.append(
                f"The workflow loops back to '{node_id}'; it must not contain cycles."
            )
            return
        node = nodes[node_id]
        if not _next_ids(node) and not isinstance(node, OutcomeNode):
            problems.append(
                f"Step '{node_id}' leads nowhere; every path must end in an outcome."
            )
        for target in _next_ids(node):
            walk(target, trail + (node_id,))

    walk(workflow.start, ())
    reachable = set()

    def mark(node_id: str):
        if node_id in reachable:
            return
        reachable.add(node_id)
        for target in _next_ids(nodes[node_id]):
            mark(target)

    if not problems:
        mark(workflow.start)
        for node_id in nodes:
            if node_id not in reachable:
                problems.append(
                    f"Step '{node_id}' can never be reached from the start."
                )
    return problems
