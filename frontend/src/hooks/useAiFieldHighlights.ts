/**
 * useAiFieldHighlights — frontend-only tracking of which complaint fields
 * were added or changed by the latest AI turn (initial extraction OR a
 * conversational correction), so the form can flash them briefly in green.
 *
 * - Compares consecutive Redux `fields` snapshots; never mutates state.
 * - A session change (Reset Form / new session) re-baselines silently.
 * - Each highlight auto-clears shortly after the CSS animation finishes.
 * - Value uses a nonce so a re-render can restart the animation via `key`.
 */

import { useEffect, useRef, useState } from "react";
import { FIELD_KEYS, type ComplaintFields, type FieldKey } from "../services/api";

/** fieldKey → nonce of the AI turn that last changed it. */
export type FieldHighlights = Partial<Record<FieldKey, number>>;

/** Keep in sync with the `aiInputFlash` / `aiRowFlash` animation duration (1.8s). */
const CLEAR_DELAY_MS = 2000;

export function useAiFieldHighlights(
  fields: ComplaintFields,
  sessionId: string | null
): FieldHighlights {
  const [highlights, setHighlights] = useState<FieldHighlights>({});
  const prevRef = useRef<{ sessionId: string | null; fields: ComplaintFields }>({
    sessionId,
    fields,
  });
  const timersRef = useRef<Partial<Record<FieldKey, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    const prev = prevRef.current;
    const sessionChanged = prev.sessionId !== sessionId;
    prevRef.current = { sessionId, fields };

    // New session (Reset Form) — re-baseline without highlighting.
    if (sessionChanged) {
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
      setHighlights({});
      return;
    }

    const changed = FIELD_KEYS.filter((k) => (fields[k] ?? "") !== (prev.fields[k] ?? ""));
    if (changed.length === 0) return;

    const nonce = Date.now();
    setHighlights((h) => {
      const next: FieldHighlights = { ...h };
      for (const k of changed) next[k] = nonce;
      return next;
    });

    for (const k of changed) {
      const existing = timersRef.current[k];
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setHighlights((h) => {
          if (h[k] !== nonce) return h; // a newer AI turn already re-highlighted this field
          const next: FieldHighlights = { ...h };
          delete next[k];
          return next;
        });
        if (timersRef.current[k] === timer) delete timersRef.current[k];
      }, CLEAR_DELAY_MS);
      timersRef.current[k] = timer;
    }
  }, [fields, sessionId]);

  // Clear pending timers on unmount.
  useEffect(() => {
    const timers = timersRef;
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  return highlights;
}
