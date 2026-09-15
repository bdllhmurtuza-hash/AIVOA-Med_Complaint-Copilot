/**
 * CopilotChat — spec §9/§10: the right panel.
 *
 * Header ("AIVOA Copilot" + online indicator), scrollable message list with
 * AI/user/system bubbles and PDF attachment cards, a drag-and-drop zone
 * (PDF only — that is what the backend actually supports), and the fixed
 * input bar with attachment + send buttons and "POWERED BY LANGGRAPH" line.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import {
  sendMessage,
  uploadFile,
  addLocalMessage,
} from "../store/complaintSlice";
import type { ChatMessage } from "../store/complaintSlice";

const INITIAL_MESSAGE =
  "Hello — I'm the AIVOA Complaint Copilot. Paste a complaint narrative, upload a PDF complaint document, and I'll extract and classify the details. You can also correct anything I extracted by telling me in chat.";

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.kind === "file") {
    const done = message.fileStatus === "done";
    const failed = message.fileStatus === "failed";
    return (
      <div className="chat-msg chat-msg--user">
        <div className={`file-card${failed ? " file-card--failed" : ""}`}>
          <span className="file-card-icon" aria-hidden>
            PDF
          </span>
          <div className="file-card-body">
            <span className="file-card-name">{message.fileName}</span>
            {failed ? (
              <span className="file-card-status file-card-status--failed">
                Upload failed
              </span>
            ) : done ? (
              <span className="file-card-status file-card-status--done">
                PDF analysis complete
              </span>
            ) : (
              <span className="file-card-status">
                <span className="spinner spinner--inline" aria-hidden />
                Extracting complaint data…
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  const roleClass =
    message.role === "user"
      ? "chat-msg--user"
      : message.role === "copilot"
        ? "chat-msg--copilot"
        : "chat-msg--system";

  return (
    <div className={`chat-msg ${roleClass}${message.kind === "error" ? " chat-msg--error" : ""}`}>
      {message.text}
    </div>
  );
}

export default function CopilotChat() {
  const dispatch = useDispatch<AppDispatch>();
  const sessionId = useSelector((s: RootState) => s.copilot.sessionId);
  const chatMessages = useSelector((s: RootState) => s.copilot.chatMessages);
  const loading = useSelector((s: RootState) => s.copilot.loading);
  const sessionStarting = useSelector((s: RootState) => s.copilot.sessionStarting);

  const [inputText, setInputText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages, loading]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !sessionId || loading) return;
    setInputText("");
    dispatch(sendMessage({ sessionId, message: text }));
  }, [inputText, sessionId, loading, dispatch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const acceptFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      if (!sessionId || loading) return;
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        dispatch(
          addLocalMessage({
            role: "system",
            kind: "error",
            text: `"${file.name}" is not supported. Only PDF complaint documents are supported.`,
          })
        );
        return;
      }
      dispatch(uploadFile({ sessionId, file }));
    },
    [sessionId, loading, dispatch]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={`chat-panel${isDragging ? " chat-panel--dragging" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="chat-header">
        <div className="chat-header-title">
          <span className="chat-online-dot" aria-hidden />
          <h2>AIVOA Copilot</h2>
        </div>
        <span className="chat-header-status">Online</span>
      </header>

      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-inner">
            <span className="drag-overlay-icon" aria-hidden>PDF</span>
            <strong>Drop complaint files here</strong>
            <span>PDF files supported</span>
          </div>
        </div>
      )}

      <div className="chat-messages">
        {!sessionStarting && !sessionId && (
          <div className="chat-empty">Connecting to copilot…</div>
        )}
        <div className="chat-msg chat-msg--copilot">{INITIAL_MESSAGE}</div>
        {chatMessages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {loading && (
          <div className="chat-msg chat-msg--copilot chat-msg--loading">
            <span className="dot-typing" aria-hidden />
            Analyzing…
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar">
        <button
          type="button"
          className="btn-attach"
          title="Attach PDF complaint document"
          aria-label="Attach PDF"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || !sessionId}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <textarea
          className="chat-input"
          placeholder="Describe the complaint or type a correction…"
          rows={1}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || !sessionId}
        />
        <button
          type="button"
          className="btn-send"
          aria-label="Send message"
          onClick={handleSend}
          disabled={loading || !inputText.trim() || !sessionId}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          hidden
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="chat-footer">POWERED BY LANGGRAPH</div>
    </div>
  );
}
