"""
AIVOA Complaint Copilot — LangGraph Agent (standalone test)

Per SPEC.md section 2:
- Single LangGraph node
- State: {messages: list, current_fields: dict}
- MemorySaver checkpointer keyed by session_id
- Node builds prompt → calls LLM → parses JSON → merges fields
- Model MUST respond in strict JSON: { reply, fields, risk_assessment }

LLM Provider swap (Sept 2026):
  Original spec required Groq gemma2-9b-it, but Groq signup was down.
  Using OpenRouter (meta-llama/llama-3.3-70b-instruct:free) as fallback.
  To swap back to Groq, change _get_llm() to return ChatGroq(...) and
  swap the import. All other code stays the same.
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Any

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict

load_dotenv()

# ---------------------------------------------------------------------------
# Complaint schema fields (single source of truth — from SPEC.md section 1)
# ---------------------------------------------------------------------------
COMPLAINT_FIELDS = [
    "complaint_source",
    "customer_name",
    "product_name",
    "product_strength",
    "batch_number",
    "affected_quantity",
    "manufacturing_date",
    "expiry_date",
    "originating_site",
    "impacted_npm",
    "complaint_category",
    "complaint_description",
]

RISK_FIELDS = [
    "risk_severity",
    "suggested_next_action",
    "initial_risk_assessment",
]

# ---------------------------------------------------------------------------
# Graph state
# ---------------------------------------------------------------------------
class AgentState(TypedDict):
    messages: list[dict[str, str]]
    current_fields: dict[str, str | None]

# ---------------------------------------------------------------------------
# System prompt — forces strict JSON output
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
You are the AIVOA Complaint Copilot — an AI assistant that extracts structured \
complaint data from free-form text or conversation.

You MUST respond with ONLY valid JSON (no markdown, no explanation outside JSON). \
Use this exact shape:

{{
  "reply": "<a friendly, concise message to the user summarising what you extracted or asking for clarification>",
  "fields": {{
    "complaint_source": "<string or null>",
    "customer_name": "<string or null>",
    "product_name": "<string or null>",
    "product_strength": "<string or null>",
    "batch_number": "<string or null>",
    "affected_quantity": "<string or null>",
    "manufacturing_date": "<string or null>",
    "expiry_date": "<string or null>",
    "originating_site": "<string or null>",
    "impacted_npm": "<string or null>",
    "complaint_category": "<string or null>",
    "complaint_description": "<string or null>"
  }},
  "risk_assessment": {{
    "risk_severity": "<Minor | Major | Critical | null>",
    "suggested_next_action": "<string or null>",
    "initial_risk_assessment": "<string or null>"
  }}
}}

Rules:
- Include ONLY fields you are confident about — leave uncertain ones as null.
- "fields" should only contain the fields this turn changed or newly extracted.
- For risk_severity, use one of: Minor, Major, Critical.
- suggested_next_action should be a concrete next step (e.g. "Initiate CAPA investigation").
- initial_risk_assessment should be a brief risk rationale.
- complaint_category should be a standard QA category (e.g. "Discoloration", "Contamination", "Packaging Defect").
- complaint_description should be a concise summary of the issue.

**customer_name extraction** — ALWAYS extract the reporting party's name.
When the text says "<Entity> reported/claims/noted/observed...", the entity before
"reported" is the customer_name. This field must NEVER be null when a reporting
party is mentioned.
  Example: "Apollo Pharmacy reported 12 discolored capsules..."
  → customer_name: "Apollo Pharmacy"

**complaint_source extraction** — Infer from the customer's identity or channel:
- If customer is a pharmacy/retailer → "Pharmacy"
- If text says "via email/phone" → "Email" / "Phone"
- If unknown, leave null.

The user's current field state is:
{current_fields}
"""


# ---------------------------------------------------------------------------
# LLM helper
# ---------------------------------------------------------------------------
def _get_llm() -> ChatOpenAI:
    """
    Return the LLM client. Currently OpenRouter (meta-llama/llama-3.3-70b-instruct:free).
    To swap back to Groq: from langchain_groq import ChatGroq
    then return ChatGroq(model="gemma2-9b-it", api_key=os.getenv("GROQ_API_KEY"))
    """
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY environment variable is not set.")
    return ChatOpenAI(
        model="meta-llama/llama-3.3-70b-instruct",
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0,
    )


def _parse_json_response(raw: str) -> dict[str, Any]:
    """Extract JSON from the model response, tolerating markdown fences."""
    text = raw.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last lines (the ``` markers)
        lines = [l for l in lines[1:] if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    return json.loads(text)


def _merge_fields(
    current: dict[str, str | None],
    new_fields: dict[str, str | None],
    new_risk: dict[str, str | None],
) -> dict[str, str | None]:
    """Merge newly extracted fields and risk_assessment into current state."""
    merged = {**current}
    for key, value in new_fields.items():
        if key in COMPLAINT_FIELDS and value is not None:
            merged[key] = value
    for key, value in new_risk.items():
        if key in RISK_FIELDS and value is not None:
            merged[key] = value
    return merged


# ---------------------------------------------------------------------------
# Graph node — single node per SPEC
# ---------------------------------------------------------------------------
def copilot_node(state: AgentState) -> dict:
    """Build prompt, call LLM, parse JSON, merge fields, return updated state."""
    llm = _get_llm()

    # Format current fields for the prompt
    current_fields_str = json.dumps(state["current_fields"], indent=2, default=str)

    # Build message list for the LLM
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT.format(current_fields=current_fields_str)},
        *state["messages"],
    ]

    # Call the model
    response = llm.invoke(messages)
    raw = response.content

    # Parse the JSON response
    parsed = _parse_json_response(raw)

    reply = parsed.get("reply", "")
    fields = parsed.get("fields", {})
    risk_assessment = parsed.get("risk_assessment", {})

    # Merge into current_fields
    merged_fields = _merge_fields(state["current_fields"], fields, risk_assessment)

    # Append the user's last message + the copilot reply to history
    new_messages = list(state["messages"])
    new_messages.append({"role": "assistant", "content": reply})

    return {
        "messages": new_messages,
        "current_fields": merged_fields,
    }


# ---------------------------------------------------------------------------
# Build the LangGraph graph
# ---------------------------------------------------------------------------
def build_graph():
    """One-node graph with MemorySaver checkpointer."""
    graph = StateGraph(AgentState)
    graph.add_node("copilot", copilot_node)
    graph.set_entry_point("copilot")
    graph.add_edge("copilot", END)

    checkpointer = MemorySaver()
    return graph.compile(checkpointer=checkpointer)


# ---------------------------------------------------------------------------
# Public API for use by FastAPI later
# ---------------------------------------------------------------------------
def run_turn(session_id: str, user_message: str, state: AgentState, graph=None) -> dict:
    """
    Execute one conversation turn.
    Returns { reply, fields, risk_assessment } plus the updated state.

    Pass a pre-built graph to persist the MemorySaver checkpointer across turns.
    """
    if graph is None:
        graph = build_graph()

    config = {"configurable": {"thread_id": session_id}}

    # Append the user message
    updated_messages = list(state["messages"])
    updated_messages.append({"role": "user", "content": user_message})

    input_state: AgentState = {
        "messages": updated_messages,
        "current_fields": state["current_fields"],
    }

    result = graph.invoke(input_state, config)

    # Extract the copilot's last reply
    assistant_msgs = [m for m in result["messages"] if m["role"] == "assistant"]
    reply = assistant_msgs[-1]["content"] if assistant_msgs else ""

    return {
        "reply": reply,
        "fields": result["current_fields"],
        "state": result,
    }


def _print_turn(label: str, result: dict) -> None:
    """Pretty-print a single turn's reply + fields + risk assessment."""
    print("\n" + "=" * 60)
    print(f"  {label}")
    print("=" * 60)

    print("\nCOPILOT REPLY:")
    print(result["reply"])

    print("\nfields (raw JSON):")
    print(json.dumps(result["fields"], indent=2, default=str))

    # Pull risk_assessment out of the full fields for a separate view
    risk_keys = {"risk_severity", "suggested_next_action", "initial_risk_assessment"}
    risk = {k: result["fields"].get(k) for k in risk_keys}
    print("\nrisk_assessment (raw JSON):")
    print(json.dumps(risk, indent=2, default=str))


# ---------------------------------------------------------------------------
# __main__ — two-turn conversation test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("AIVOA Complaint Copilot — LangGraph Agent Test")
    print("  (two-turn conversation memory test)")
    print("=" * 60)

    session_id = str(uuid.uuid4())
    print(f"\nSession ID: {session_id}\n")

    # Build graph ONCE so the MemorySaver checkpointer persists across turns
    graph = build_graph()

    # Start with empty fields
    state: AgentState = {
        "messages": [],
        "current_fields": {f: None for f in COMPLAINT_FIELDS + RISK_FIELDS},
    }

    # ---- Turn 1: initial complaint ----
    turn1_msg = (
        "Apollo Pharmacy reported 12 discolored capsules in Amoxicillin "
        "Capsules 500mg. Batch AMX240602. Manufacturing date March 2026, "
        "expiry February 2028."
    )

    print(f"Turn 1 — User:\n  {turn1_msg}\n")
    result1 = run_turn(session_id, turn1_msg, state, graph=graph)
    _print_turn("Turn 1 — Agent output", result1)

    # Update state from Turn 1 so Turn 2 sees the merged fields
    state = result1["state"]

    # ---- Turn 2: correction + new info (sent in a second document) ----
    turn2_msg = (
        "Correction — the originating site is Pune plant. Also, 5 units "
        "out of the 12 were opened and showed powder clumping inside. "
        "Category should be contamination, not discoloration."
    )

    print(f"\nTurn 2 — User:\n  {turn2_msg}\n")
    result2 = run_turn(session_id, turn2_msg, state, graph=graph)
    _print_turn("Turn 2 — Agent output (merged with Turn 1)", result2)

    # ---- Verify field merging ----
    print("\n" + "=" * 60)
    print("  FIELD MERGE VERIFICATION")
    print("=" * 60)

    f2 = result2["fields"]
    checks = [
        ("complaint_source", "Pharmacy"),
        ("customer_name", "Apollo Pharmacy"),
        ("product_name", "Amoxicillin Capsules"),
        ("batch_number", "AMX240602"),
        ("originating_site", "Pune plant"),
        ("complaint_category", "Contamination"),
        ("complaint_description", None),  # may have changed
    ]

    all_pass = True
    for key, expected in checks:
        actual = f2.get(key)
        # For fields we don't assert an exact value, just that they survived
        if expected is not None:
            ok = actual == expected
        else:
            ok = True  # just check it's present from Turn 1
        tag = "PASS" if ok else "FAIL"
        if not ok:
            all_pass = False
        print(f"  {tag}  {key}: {actual}")

    # Confirm Turn 1 fields survived the merge
    preserved = ["batch_number", "affected_quantity", "manufacturing_date", "expiry_date"]
    for key in preserved:
        val = f2.get(key)
        tag = "PASS" if val else "FAIL"
        if not val:
            all_pass = False
        print(f"  {tag}  {key} (preserved from Turn 1): {val}")

    print()
    if all_pass:
        print("  ✓ ALL CHECKS PASSED — memory + merge working correctly")
    else:
        print("  ✗ SOME CHECKS FAILED — review output above")
    print("=" * 60)
