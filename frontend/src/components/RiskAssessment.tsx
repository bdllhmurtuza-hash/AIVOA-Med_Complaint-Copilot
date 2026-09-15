/**
 * RiskAssessment — spec STATE 3 / §3: renders the backend-provided risk
 * assessment in a visually distinct "AI COPILOT RISK ASSESSMENT" section.
 * Values come straight from Redux (backend response) — no frontend algorithm.
 * Rows recently changed by the AI flash briefly (green) via `highlights`.
 */

import { useSelector } from "react-redux";
import type { RootState } from "../store/store";
import type { FieldHighlights } from "../hooks/useAiFieldHighlights";

function RiskRow({
  label,
  highlightNonce,
  children,
}: {
  label: string;
  highlightNonce?: number;
  children: React.ReactNode;
}) {
  // `key` remounts the row on a new AI turn so the flash animation restarts.
  return (
    <div
      key={highlightNonce}
      className={`field-group${highlightNonce ? " risk-field--ai-flash" : ""}`}
    >
      <label>{label}</label>
      {children}
    </div>
  );
}

export default function RiskAssessment({
  highlights = {},
}: {
  highlights?: FieldHighlights;
}) {
  const fields = useSelector((s: RootState) => s.copilot.fields);

  const severity = fields.risk_severity;
  const nextAction = fields.suggested_next_action;
  const assessment = fields.initial_risk_assessment;

  const hasAny = Boolean(severity || nextAction || assessment);

  if (!hasAny) {
    return (
      <div className="risk-card risk-card--empty">
        <h3 className="section-title section-title--risk">AI Copilot Risk Assessment</h3>
        <p className="risk-empty">Awaiting AI classification…</p>
      </div>
    );
  }

  return (
    <div className="risk-card">
      <h3 className="section-title section-title--risk">AI Copilot Risk Assessment</h3>
      <div className="risk-grid">
        <RiskRow label="Severity (Suggested)" highlightNonce={highlights.risk_severity}>
          <span className={`severity-chip severity-chip--${(severity ?? "").toLowerCase()}`}>
            {severity ?? "—"}
          </span>
        </RiskRow>
        <RiskRow
          label="Suggested Next Action"
          highlightNonce={highlights.suggested_next_action}
        >
          <p className="risk-value">{nextAction ?? "—"}</p>
        </RiskRow>
        <RiskRow
          label="Initial Risk Assessment"
          highlightNonce={highlights.initial_risk_assessment}
        >
          <p className="risk-value">{assessment ?? "—"}</p>
        </RiskRow>
      </div>
    </div>
  );
}
