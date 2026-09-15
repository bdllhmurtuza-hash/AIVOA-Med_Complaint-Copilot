/**
 * Complaint copilot slice — matches SPEC.md §5 and the frontend spec §8.
 *
 * State shape:
 *   { sessionId, fields, chatMessages, status, loading, committed }
 *
 * Thunks: startSession, sendMessage, uploadFile, commitComplaint, resetSession
 *
 * Notes:
 * - The backend returns the FULL merged field state on every /message and
 *   /upload turn, so we merge it over the current fields (keys the backend
 *   omitted are preserved untouched — spec STATE 4).
 * - The backend appends duplicate-detection notes ("⚠️ Duplicate detected…")
 *   to the copilot reply; we split those off into their own styled bubble.
 */

import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import {
  api,
  EMPTY_FIELDS,
  FIELD_KEYS,
  type ComplaintFields,
  type TriageStatus,
} from "../services/api";

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------
export type MessageRole = "user" | "copilot" | "system";
export type MessageKind = "text" | "file" | "error" | "duplicate-warning" | "success";
export type FileStatus = "extracting" | "done" | "failed";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  text: string;
  fileName?: string;
  fileStatus?: FileStatus;
}

let nextMessageId = 1;
const makeMessageId = () => `m${nextMessageId++}`;

function splitDuplicateWarning(reply: string): { main: string; warning: string | null } {
  const idx = reply.indexOf("⚠️");
  if (idx === -1) return { main: reply.trim(), warning: null };
  return {
    main: reply.slice(0, idx).trim(),
    warning: reply.slice(idx).trim(),
  };
}

/** Merge a backend fields payload into state, preserving untouched keys. */
function mergeFields(
  current: ComplaintFields,
  payload: Partial<ComplaintFields> | undefined
): ComplaintFields {
  const next: ComplaintFields = { ...current };
  if (!payload) return next;
  for (const key of FIELD_KEYS) {
    const value = payload[key];
    if (value !== undefined) next[key] = value;
  }
  return next;
}

function pushCopilotReply(state: ComplaintState, reply: string) {
  const { main, warning } = splitDuplicateWarning(reply);
  if (main) {
    state.chatMessages.push({ id: makeMessageId(), role: "copilot", kind: "text", text: main });
  }
  if (warning) {
    state.chatMessages.push({
      id: makeMessageId(),
      role: "system",
      kind: "duplicate-warning",
      text: warning,
    });
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export type UploadStage = "idle" | "extracting" | "done" | "failed";

interface ComplaintState {
  sessionId: string | null;
  fields: ComplaintFields;
  chatMessages: ChatMessage[];
  status: TriageStatus;
  /** a copilot turn (message or upload) is in flight */
  loading: boolean;
  /** the initial session request is in flight (guards StrictMode double-fire) */
  sessionStarting: boolean;
  /** commit request is in flight */
  committing: boolean;
  uploadStage: UploadStage;
  committed: { complaint_id: number; committed_at: string } | null;
}

const initialState: ComplaintState = {
  sessionId: null,
  fields: { ...EMPTY_FIELDS },
  chatMessages: [],
  status: "pending_triage",
  loading: false,
  sessionStarting: false,
  committing: false,
  uploadStage: "idle",
  committed: null,
};

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

/** POST /copilot/session → { session_id } */
export const startSession = createAsyncThunk("copilot/startSession", () => api.startSession());

/** POST /copilot/message → { reply, fields, status } */
export const sendMessage = createAsyncThunk(
  "copilot/sendMessage",
  ({ sessionId, message }: { sessionId: string; message: string }) =>
    api.sendMessage(sessionId, message)
);

/** POST /copilot/upload (multipart) → { reply, fields, status } */
export const uploadFile = createAsyncThunk(
  "copilot/uploadFile",
  ({ sessionId, file }: { sessionId: string; file: File }) => api.uploadFile(sessionId, file)
);

/** POST /complaints/commit → { complaint_id, committed_at } */
export const commitComplaint = createAsyncThunk(
  "copilot/commitComplaint",
  ({ sessionId, fields }: { sessionId: string; fields: ComplaintFields }) =>
    api.commitComplaint(sessionId, fields)
);

/** Spec §7 — clear the workspace, then start a fresh copilot session. */
export const resetSession = createAsyncThunk(
  "copilot/resetSession",
  async (_, { dispatch }) => {
    dispatch(clearWorkspace());
    dispatch(startSession());
  }
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------
const complaintSlice = createSlice({
  name: "copilot",
  initialState,
  reducers: {
    clearWorkspace(state) {
      state.sessionId = null;
      state.fields = { ...EMPTY_FIELDS };
      state.chatMessages = [];
      state.status = "pending_triage";
      state.loading = false;
      state.committing = false;
      state.uploadStage = "idle";
      state.committed = null;
    },
    /** Local, non-backend message (e.g. unsupported file type rejection). */
    addLocalMessage(
      state,
      action: PayloadAction<{ role: MessageRole; kind: MessageKind; text: string }>
    ) {
      state.chatMessages.push({ id: makeMessageId(), ...action.payload });
    },
  },
  extraReducers: (builder) => {
    builder
      // --- startSession ---
      .addCase(startSession.pending, (state) => {
        state.sessionStarting = true;
      })
      .addCase(startSession.fulfilled, (state, action) => {
        state.sessionStarting = false;
        state.sessionId = action.payload.session_id;
      })
      .addCase(startSession.rejected, (state) => {
        // Leave sessionStarting = true to prevent useEffect retry loop.
        // The error message is shown once; user must manually refresh.
        state.chatMessages.push({
          id: makeMessageId(),
          role: "system",
          kind: "error",
          text: "Could not reach the copilot backend. Please refresh the page.",
        });
      })

      // --- sendMessage ---
      .addCase(sendMessage.pending, (state, action) => {
        state.loading = true;
        state.chatMessages.push({
          id: makeMessageId(),
          role: "user",
          kind: "text",
          text: action.meta.arg.message,
        });
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.loading = false;
        state.fields = mergeFields(state.fields, action.payload.fields);
        state.status = action.payload.status;
        pushCopilotReply(state, action.payload.reply || "Done — the form has been updated.");
      })
      .addCase(sendMessage.rejected, (state) => {
        state.loading = false;
        state.chatMessages.push({
          id: makeMessageId(),
          role: "system",
          kind: "error",
          text: "Message failed to send. Please try again.",
        });
      })

      // --- uploadFile ---
      .addCase(uploadFile.pending, (state, action) => {
        state.loading = true;
        state.uploadStage = "extracting";
        state.chatMessages.push({
          id: `file-${action.meta.requestId}`,
          role: "user",
          kind: "file",
          text: "",
          fileName: action.meta.arg.file.name,
          fileStatus: "extracting",
        });
      })
      .addCase(uploadFile.fulfilled, (state, action) => {
        state.loading = false;
        state.uploadStage = "done";
        state.fields = mergeFields(state.fields, action.payload.fields);
        state.status = action.payload.status;
        const msg = state.chatMessages.find((m) => m.id === `file-${action.meta.requestId}`);
        if (msg) msg.fileStatus = "done";
        pushCopilotReply(state, action.payload.reply || "PDF analysis complete.");
      })
      .addCase(uploadFile.rejected, (state, action) => {
        state.loading = false;
        state.uploadStage = "failed";
        const msg = state.chatMessages.find((m) => m.id === `file-${action.meta.requestId}`);
        if (msg) msg.fileStatus = "failed";
        state.chatMessages.push({
          id: makeMessageId(),
          role: "system",
          kind: "error",
          text: "PDF upload failed. Please try again.",
        });
      })

      // --- commitComplaint ---
      .addCase(commitComplaint.pending, (state) => {
        state.committing = true;
      })
      .addCase(commitComplaint.fulfilled, (state, action) => {
        state.committing = false;
        state.committed = action.payload;
        state.chatMessages.push({
          id: makeMessageId(),
          role: "system",
          kind: "success",
          text: `Complaint committed to the QMS Ledger — ID #${action.payload.complaint_id}.`,
        });
      })
      .addCase(commitComplaint.rejected, (state) => {
        state.committing = false;
        state.chatMessages.push({
          id: makeMessageId(),
          role: "system",
          kind: "error",
          text: "Commit failed. Please try again.",
        });
      })

      // --- resetSession (workspace already cleared via clearWorkspace) ---
      .addCase(resetSession.fulfilled, () => {
        /* sessionId is set by the inner startSession dispatch */
      });
  },
});

export const { clearWorkspace, addLocalMessage } = complaintSlice.actions;
export default complaintSlice.reducer;
