/**
 * ComplaintForm — spec §3/§4: the left panel.
 *
 * Four sections from the backend complaint schema + the AI Copilot Risk
 * Assessment card + Commit / Reset actions at the bottom.
 *
 * Fields are read-only (user decision): they display AI-extracted values,
 * "Awaiting AI extraction…" placeholders when empty, and all corrections
 * happen through the copilot chat. The panel scrolls independently so the
 * chat never disappears (spec §3).
 */

import { useDispatch, useSelector } from "react-redux";
import type { RootState, AppDispatch } from "../store/store";
import { commitComplaint, resetSession } from "../store/complaintSlice";
import RiskAssessment from "./RiskAssessment";
import { useAiFieldHighlights } from "../hooks/useAiFieldHighlights";
import type { FieldKey } from "../services/api";

const PLACEHOLDER = "Awaiting AI extraction…";

const SECTIONS: { title: string; fields: { key: FieldKey; label: string }[] }[] = [
  {
    title: "Origin & Customer Details",
    fields: [
      { key: "complaint_source", label: "Complaint Source" },
      { key: "customer_name", label: "Customer Name" },
    ],
  },
  {
    title: "Product & Batch Identification",
    fields: [
      { key: "product_name", label: "Product Name" },
      { key: "product_strength", label: "Product Strength" },
      { key: "batch_number", label: "Batch / Lot Number" },
      { key: "affected_quantity", label: "Affected Quantity" },
      { key: "manufacturing_date", label: "Manufacturing Date" },
      { key: "expiry_date", label: "Expiry Date" },
    ],
  },
  {
    title: "Facility & Material Impact",
    fields: [
      { key: "originating_site", label: "Originating Site / Block" },
      { key: "impacted_npm", label: "Impacted Non-Product Materials (NPM)" },
    ],
  },
  {
    title: "Defect Analysis",
    fields: [
      { key: "complaint_category", label: "Complaint Category" },
      { key: "complaint_description", label: "Complaint Description" },
    ],
  },
];

function FieldRow({
  fieldKey,
  label,
  highlightNonce,
}: {
  fieldKey: FieldKey;
  label: string;
  highlightNonce?: number;
}) {
  const value = useSelector((s: RootState) => s.copilot.fields[fieldKey]);
  // `key` remounts the row when a new AI turn changes this field so the
  // flash animation restarts cleanly.
  return (
    <div
      key={highlightNonce}
      className={`field-group${highlightNonce ? " field-group--ai-flash" : ""}`}
    >
      <label className="field-label">{label}</label>
      <input
        type="text"
        className="field-input"
        value={value ?? ""}
        placeholder={PLACEHOLDER}
        readOnly
      />
    </div>
  );
}

export default function ComplaintForm() {
  const dispatch = useDispatch<AppDispatch>();
  const sessionId = useSelector((s: RootState) => s.copilot.sessionId);
  const status = useSelector((s: RootState) => s.copilot.status);
  const fields = useSelector((s: RootState) => s.copilot.fields);
  const committing = useSelector((s: RootState) => s.copilot.committing);
  const committed = useSelector((s: RootState) => s.copilot.committed);

  // Frontend-only: which fields the latest AI turn added/changed (for the
  // brief green flash). Read-only behavior is unchanged.
  const highlights = useAiFieldHighlights(fields, sessionId);

  const canCommit = status === "ready_to_commit" && !committing && !committed;

  const handleCommit = () => {
    if (!sessionId || !canCommit) return;
    dispatch(commitComplaint({ sessionId, fields }));
  };

  const handleReset = () => {
    if (committing) return;
    dispatch(resetSession());
  };

  return (
    <div className="form-panel">
      <div className="form-scroll">
        {SECTIONS.map((section) => (
          <section className="form-section" key={section.title}>
            <h2 className="section-title">{section.title}</h2>
            <div className="section-grid">
              {section.fields.map((f) => (
                <FieldRow
                  key={f.key}
                  fieldKey={f.key}
                  label={f.label}
                  highlightNonce={highlights[f.key]}
                />
              ))}
            </div>
          </section>
        ))}

        <RiskAssessment highlights={highlights} />
      </div>

      <footer className="form-footer">
        {committed && (
          <div className="commit-success">
            Committed to QMS Ledger — Complaint #{committed.complaint_id}
          </div>
        )}
        <div className="form-footer-actions">
          <button
            type="button"
            className="btn-reset"
            onClick={handleReset}
            disabled={committing}
          >
            Reset Form
          </button>
          <button
            type="button"
            className="btn-commit"
            onClick={handleCommit}
            disabled={!canCommit}
          >
            {committing ? "Committing…" : "Commit to QMS Ledger"}
          </button>
        </div>
      </footer>
    </div>
  );
}
