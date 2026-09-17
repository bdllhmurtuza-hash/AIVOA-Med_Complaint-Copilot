"""
AIVOA Complaint Copilot — FastAPI application

Endpoints per SPEC.md section 3:
  POST /copilot/session   → { session_id }
  POST /copilot/message   → { reply, fields, status }
  POST /copilot/upload    → { reply, fields, status }
  POST /complaints/commit → { complaint_id, committed_at }

Bonus: duplicate complaint detection (product_name + batch_number match).
"""

from fastapi.middleware.cors import CORSMiddleware
from __future__ import annotations

import io
import sys
import uuid
from datetime import datetime

import pdfplumber
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from sqlalchemy import text

# Ensure the backend root is on sys.path so agent_test.py is importable
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))

from agent_test import (
    AgentState,
    build_graph,
    run_turn,
    COMPLAINT_FIELDS,
    RISK_FIELDS,
)
from app.database import SessionLocal, engine, Base
from app.models import Complaint
from app.schemas import (
    MessageRequest,
    CommitRequest,
    SessionResponse,
    CopilotResponse,
    CommitResponse,
    FIELD_KEYS,
    RISK_KEYS,
)
from app.duplicate_check import check_and_append_note

load_dotenv()

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="AIVOA Complaint Copilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://aivoa-med-complaint-copilot-1.onrender.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# In-memory session store
# session_id → { graph, state: AgentState }
# Graph + MemorySaver live in the FastAPI process (per SPEC.md).
# ---------------------------------------------------------------------------
sessions: dict[str, dict] = {}


def _all_fields_non_empty(fields: dict[str, str | None]) -> bool:
    """Return True when every required field is non-null/non-empty."""
    for key in COMPLAINT_FIELDS + RISK_FIELDS:
        if not fields.get(key):
            return False
    return True


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health")
def health_check():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /copilot/session — start a new form session
# ---------------------------------------------------------------------------
@app.post("/copilot/session", response_model=SessionResponse)
def start_session():
    session_id = str(uuid.uuid4())
    graph = build_graph()

    initial_fields: dict[str, str | None] = {f: None for f in COMPLAINT_FIELDS + RISK_FIELDS}
    initial_state: AgentState = {
        "messages": [],
        "current_fields": initial_fields,
    }

    sessions[session_id] = {
        "graph": graph,
        "state": initial_state,
    }

    return SessionResponse(session_id=session_id)


# ---------------------------------------------------------------------------
# POST /copilot/message — send a text message
# ---------------------------------------------------------------------------
@app.post("/copilot/message", response_model=CopilotResponse)
def send_message(req: MessageRequest):
    session = sessions.get(req.session_id)
    if not session:
        return CopilotResponse(reply="Session not found.", fields={}, status="pending_triage")

    result = run_turn(
        session_id=req.session_id,
        user_message=req.message,
        state=session["state"],
        graph=session["graph"],
    )

    # Update session state
    session["state"] = result["state"]

    # Compute status
    status = "ready_to_commit" if _all_fields_non_empty(result["fields"]) else "pending_triage"

    # Duplicate detection — append note if same product+batch was committed before
    reply = check_and_append_note(result["reply"], result["fields"])

    return CopilotResponse(
        reply=reply,
        fields=result["fields"],
        status=status,
    )


# ---------------------------------------------------------------------------
# POST /copilot/upload — extract text from PDF, treat as user message
# ---------------------------------------------------------------------------
@app.post("/copilot/upload", response_model=CopilotResponse)
async def upload_file(session_id: str = "", file: UploadFile = File(...)):
    session = sessions.get(session_id)
    if not session:
        return CopilotResponse(reply="Session not found.", fields={}, status="pending_triage")

    # Read PDF and extract text with pdfplumber
    pdf_bytes = await file.read()
    extracted_text = ""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    extracted_text += page_text + "\n"
    except Exception:
        return CopilotResponse(
            reply="The uploaded file could not be parsed as a valid PDF.",
            fields=session["state"]["current_fields"],
            status="pending_triage",
        )

    if not extracted_text.strip():
        return CopilotResponse(
            reply="Could not extract text from the uploaded PDF.",
            fields=session["state"]["current_fields"],
            status="pending_triage",
        )

    # Feed extracted text into the agent as a user message
    result = run_turn(
        session_id=session_id,
        user_message=extracted_text.strip(),
        state=session["state"],
        graph=session["graph"],
    )

    session["state"] = result["state"]

    status = "ready_to_commit" if _all_fields_non_empty(result["fields"]) else "pending_triage"

    # Duplicate detection
    reply = check_and_append_note(result["reply"], result["fields"])

    return CopilotResponse(
        reply=reply,
        fields=result["fields"],
        status=status,
    )


# ---------------------------------------------------------------------------
# POST /complaints/commit — write final complaint to MySQL
# ---------------------------------------------------------------------------
@app.post("/complaints/commit", response_model=CommitResponse)
def commit_complaint(req: CommitRequest):
    now = datetime.utcnow()

    db = SessionLocal()
    try:
        complaint = Complaint(
            session_id=req.session_id,
            complaint_source=req.fields.get("complaint_source"),
            customer_name=req.fields.get("customer_name"),
            product_name=req.fields.get("product_name"),
            product_strength=req.fields.get("product_strength"),
            batch_number=req.fields.get("batch_number"),
            affected_quantity=req.fields.get("affected_quantity"),
            manufacturing_date=req.fields.get("manufacturing_date"),
            expiry_date=req.fields.get("expiry_date"),
            originating_site=req.fields.get("originating_site"),
            impacted_npm=req.fields.get("impacted_npm"),
            complaint_category=req.fields.get("complaint_category"),
            complaint_description=req.fields.get("complaint_description"),
            risk_severity=req.fields.get("risk_severity"),
            suggested_next_action=req.fields.get("suggested_next_action"),
            initial_risk_assessment=req.fields.get("initial_risk_assessment"),
            committed_at=now,
        )
        db.add(complaint)
        db.commit()
        db.refresh(complaint)

        return CommitResponse(
            complaint_id=complaint.id,
            committed_at=complaint.committed_at,
        )
    finally:
        db.close()
