# AIVOA Complaint Copilot — Build Spec

## 1. Complaint schema (single source of truth — use this everywhere: LLM prompt, Redux state, Postgres table)

```json
{
  "complaint_source": "string",          // e.g. Pharmacy, Email, Phone
  "customer_name": "string",
  "product_name": "string",
  "product_strength": "string",
  "batch_number": "string",
  "affected_quantity": "string",
  "manufacturing_date": "string",
  "expiry_date": "string",
  "originating_site": "string",
  "impacted_npm": "string",              // Non-Product Materials
  "complaint_category": "string",
  "complaint_description": "string",
  "risk_severity": "string",             // AI-suggested: Minor / Major / Critical
  "suggested_next_action": "string",
  "initial_risk_assessment": "string"
}
```

Any field the AI hasn't determined yet stays `null`/empty — the frontend shows "Awaiting AI extraction…" placeholders for those.

## 2. Why this is a *conversational* agent, not one-shot extraction

The demo shows: initial parse → correction via chat → second document merges more fields. So the LangGraph agent needs **memory of the conversation + current field state**, scoped per session (one form session = one LangGraph thread).

**Skip native tool-calling.** `gemma2-9b-it` (the mandatory model) has unreliable tool-calling support on Groq — don't burn hours debugging that. Instead, prompt the model to *always* respond in strict JSON:

```json
{
  "reply": "string — what the copilot says back to the user",
  "fields": { /* only the fields this turn changed or newly extracted */ },
  "risk_assessment": {
    "risk_severity": "string or null",
    "suggested_next_action": "string or null",
    "initial_risk_assessment": "string or null"
  }
}
```

Your backend parses this JSON, merges `fields` + `risk_assessment` into the session's current state, and returns the merged state to the frontend. This sidesteps tool-calling reliability issues entirely and is much faster to build.

**LangGraph graph:** keep it to one node.
- State: `{messages: list, current_fields: dict}` (use `MemorySaver` checkpointer, keyed by `session_id` — no DB needed for this, it can live in-memory for the demo)
- Node: build a prompt with (system instructions + schema + current_fields + full message history) → call Groq → parse JSON → merge into `current_fields` → append to messages
- That's it. One node, looped by the chat interface. Add a second node later only if you have time for a bonus feature (e.g. duplicate detection as a separate node).

## 3. API contract (FastAPI)

```
POST /copilot/session          -> { session_id }                    # start a new form
POST /copilot/message           body: { session_id, message }
                                 -> { reply, fields, status }        # text chat turn
POST /copilot/upload            body: multipart { session_id, file }
                                 -> { reply, fields, status }        # PDF -> extract text -> same flow as /message
POST /complaints/commit         body: { session_id, fields }
                                 -> { complaint_id, committed_at }   # writes final row to Postgres
```

`status` = `"pending_triage"` until every required field is non-empty, then `"ready_to_commit"` — this drives the badge in the UI.

For PDF text extraction, `pdfplumber` or `pypdf` is enough (assignment explicitly says production-grade OCR isn't required) — just pull raw text and feed it into the same prompt as if the user had pasted it.

## 4. Postgres — only needed at commit time

```sql
CREATE TABLE complaints (
  id SERIAL PRIMARY KEY,
  session_id TEXT,
  complaint_source TEXT, customer_name TEXT,
  product_name TEXT, product_strength TEXT,
  batch_number TEXT, affected_quantity TEXT,
  manufacturing_date TEXT, expiry_date TEXT,
  originating_site TEXT, impacted_npm TEXT,
  complaint_category TEXT, complaint_description TEXT,
  risk_severity TEXT, suggested_next_action TEXT, initial_risk_assessment TEXT,
  committed_at TIMESTAMP DEFAULT now()
);
```

No need to persist every chat turn to the DB — the LangGraph checkpointer holds session state in memory while the user works; Postgres only gets written to on "Commit to QMS Ledger."

## 5. Redux Toolkit slice shape

```js
{
  sessionId: null,
  fields: { /* schema above, all null initially */ },
  chatMessages: [ { role: 'copilot' | 'user', text } ],
  status: 'pending_triage' | 'ready_to_commit',
  loading: false
}
```

Thunks: `startSession`, `sendMessage`, `uploadFile`, `commitComplaint`. Each just calls the matching endpoint and merges the response into `fields`/`chatMessages`/`status`.

## 6. Frontend layout

Two-column: left = the 4-section form (render straight from `fields`, editable inputs), right = chat panel (`chatMessages` list + input box + file-drop). Status badge top-right reads from `status`. "Commit to QMS Ledger" button disabled until `status === 'ready_to_commit'`, calls `commitComplaint` thunk on click.

## 7. Build order given this design

1. Get the LangGraph agent working as a standalone script first — hardcode a fake `current_fields` dict, send it a test message, confirm you get back valid parsed JSON. This is the highest-risk piece; de-risk before wiring anything else.
2. Wrap it in the 3 chat/upload FastAPI endpoints, test with curl/Postman.
3. Build the commit endpoint + Postgres table.
4. Build the Redux slice + two-column React UI.
5. Wire frontend to backend, test the full loop: paste → fields fill → correction → PDF upload → commit.
6. Create 2–3 sample complaint texts/PDFs for the demo recording.
7. Record both demo videos, script the narration in advance.
