/**
 * Centralized API service (spec §11–§12)
 *
 * The only place that talks to the FastAPI backend. Uses relative URLs,
 * which the Vite dev proxy forwards to http://localhost:8000.
 *
 * Endpoints (existing backend — do not rename):
 *   POST /copilot/session    -> { session_id }
 *   POST /copilot/message    -> { reply, fields, status }
 *   POST /copilot/upload     -> { reply, fields, status }
 *   POST /complaints/commit  -> { complaint_id, committed_at }
 */

// ---------------------------------------------------------------------------
// Complaint schema (single source of truth — SPEC §1, mirrored by the backend)
// ---------------------------------------------------------------------------
export const FIELD_KEYS = [
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
  "risk_severity",
  "suggested_next_action",
  "initial_risk_assessment",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export type ComplaintFields = Record<FieldKey, string | null>;

export const EMPTY_FIELDS: ComplaintFields = FIELD_KEYS.reduce((acc, key) => {
  acc[key] = null;
  return acc;
}, {} as ComplaintFields);

// ---------------------------------------------------------------------------
// API request/response shapes (mirror backend/app/schemas.py)
// ---------------------------------------------------------------------------
export type TriageStatus = "pending_triage" | "ready_to_commit";

export interface SessionResponse {
  session_id: string;
}

export interface CopilotResponse {
  reply: string;
  fields: Partial<ComplaintFields>;
  status: TriageStatus;
}

export interface CommitResponse {
  complaint_id: number;
  committed_at: string;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${url} failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

async function postForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`${url} failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Endpoint wrappers
// ---------------------------------------------------------------------------
export const api = {
  /** POST /copilot/session — start a new form session (one workspace = one LangGraph thread) */
  startSession: () => postJson<SessionResponse>("/copilot/session", {}),

  /** POST /copilot/message — one conversational turn */
  sendMessage: (sessionId: string, message: string) =>
    postJson<CopilotResponse>("/copilot/message", {
      session_id: sessionId,
      message,
    }),

  /** POST /copilot/upload — PDF extraction turn (multipart/form-data + session_id) */
  uploadFile: (sessionId: string, file: File) => {
    const form = new FormData();
    form.append("session_id", sessionId);
    form.append("file", file);
    return postForm<CopilotResponse>("/copilot/upload", form);
  },

  /** POST /complaints/commit — the ONLY endpoint that writes to PostgreSQL */
  commitComplaint: (sessionId: string, fields: ComplaintFields) =>
    postJson<CommitResponse>("/complaints/commit", {
      session_id: sessionId,
      fields,
    }),
};
