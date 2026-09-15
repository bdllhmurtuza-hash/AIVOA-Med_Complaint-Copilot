/**
 * StatusBadge — spec §5: renders the backend triage status.
 * Only two states exist; styling is subtle yellow/green per spec §15.
 */

import { useSelector } from "react-redux";
import type { RootState } from "../store/store";

const LABELS: Record<string, string> = {
  pending_triage: "Pending Triage",
  ready_to_commit: "Ready to Commit",
};

export default function StatusBadge() {
  const status = useSelector((s: RootState) => s.copilot.status);
  return <span className={`badge badge--${status}`}>{LABELS[status] ?? status}</span>;
}
