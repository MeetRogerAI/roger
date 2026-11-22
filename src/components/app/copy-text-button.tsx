"use client";

import { useState } from "react";

/**
 * Copies text and says so, out loud for screen readers too. If the browser
 * blocks the clipboard, it says how to copy by hand instead of failing silently.
 */
export function CopyTextButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "blocked">("idle");
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("done");
        } catch {
          setState("blocked");
        }
        setTimeout(() => setState("idle"), 2400);
      }}
    >
      <span aria-live="polite">{state === "done" ? "Copied" : state === "blocked" ? "Copy blocked: select the text and copy it" : label}</span>
    </button>
  );
}
