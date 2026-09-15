/**
 * App — two-column QMS workspace (spec §1/§2).
 *
 * Header: "Log Customer Complaint" + "API & FDF Quality Assurance Module"
 *         + backend-driven triage status badge.
 * Left:   complaint form (independent scroll).
 * Right:  AIVOA Copilot chat.
 *
 * No landing page, no navigation, no dashboard chrome.
 */

import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "./store/store";
import { startSession } from "./store/complaintSlice";
import ComplaintForm from "./components/ComplaintForm";
import CopilotChat from "./components/CopilotChat";
import StatusBadge from "./components/StatusBadge";

export default function App() {
  const dispatch = useDispatch<AppDispatch>();
  const sessionId = useSelector((s: RootState) => s.copilot.sessionId);
  const sessionStarting = useSelector((s: RootState) => s.copilot.sessionStarting);

  // One complaint workspace = one LangGraph session (spec §11).
  useEffect(() => {
    if (!sessionId && !sessionStarting) {
      dispatch(startSession());
    }
  }, [sessionId, sessionStarting, dispatch]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-titles">
          <h1>Log Customer Complaint</h1>
          <p className="app-header-subtitle">API &amp; FDF Quality Assurance Module</p>
        </div>
        <StatusBadge />
      </header>

      <main className="workspace">
        <ComplaintForm />
        <CopilotChat />
      </main>
    </div>
  );
}
