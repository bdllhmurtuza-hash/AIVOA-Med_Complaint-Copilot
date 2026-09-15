"""Pydantic schemas for request / response bodies."""

from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


# ---- Complaint field shape (single source of truth — SPEC §1) ----
FIELD_KEYS = [
    "complaint_source", "customer_name", "product_name", "product_strength",
    "batch_number", "affected_quantity", "manufacturing_date", "expiry_date",
    "originating_site", "impacted_npm", "complaint_category", "complaint_description",
]
RISK_KEYS = ["risk_severity", "suggested_next_action", "initial_risk_assessment"]


# ---- Request schemas ----
class SessionStart(BaseModel):
    pass


class MessageRequest(BaseModel):
    session_id: str
    message: str


class CommitRequest(BaseModel):
    session_id: str
    fields: dict[str, str | None]


# ---- Response schemas ----
class SessionResponse(BaseModel):
    session_id: str


class CopilotResponse(BaseModel):
    reply: str
    fields: dict[str, str | None]
    status: str  # "pending_triage" | "ready_to_commit"


class CommitResponse(BaseModel):
    complaint_id: int
    committed_at: datetime
