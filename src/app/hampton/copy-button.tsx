"use client";

import { useState } from "react";

/** Copies text to the clipboard and says so, out loud for screen readers too. */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked: Download still works */
        }
      }}
      className={className}
    >
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}
