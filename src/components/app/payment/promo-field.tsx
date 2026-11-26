"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PromoView } from "@/lib/billing/payment-view";

/**
 * "Have a promo code?" (plan 2026-11-26-001, Unit 6; origin R17): a quiet
 * link that opens one field and an Apply button. The code is checked on the
 * server; any refusal reads the same generic line, and the field keeps what
 * was typed. An applied code shows with a Remove control. Not a form: it sits
 * beside the card form and must never submit or reset it.
 */
export function PromoField({
  promo,
  onApply,
  onRemove,
  disabled = false,
  initiallyOpen = false,
}: {
  promo: PromoView | null;
  /** Resolves to an error message, or null when the code was applied. */
  onApply: (code: string) => Promise<string | null>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "removing">("idle");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const opened = useRef(false);
  const id = useId();

  useEffect(() => {
    // Focus the field when the person opened it (not on first render).
    if (open && opened.current) input.current?.focus();
  }, [open]);

  async function apply() {
    if (state !== "idle") return;
    if (!code.trim()) {
      setError("Enter a code.");
      input.current?.focus();
      return;
    }
    setState("checking");
    setError(null);
    const message = await onApply(code).catch(() => "We couldn’t check that code. Try again.");
    setState("idle");
    if (message) {
      setError(message);
      input.current?.focus();
    } else setCode("");
  }

  async function remove() {
    if (state !== "idle") return;
    setState("removing");
    await onRemove().catch(() => {});
    setState("idle");
  }

  if (promo) {
    return (
      <p className="flex flex-wrap items-center justify-between gap-2 text-small">
        <span>
          Code <strong className="font-semibold">{promo.code}</strong> applied
        </span>
        <button type="button" onClick={remove} disabled={disabled || state !== "idle"} className="tlink min-h-11 cursor-pointer disabled:cursor-wait">
          {state === "removing" ? "Removing…" : "Remove"}
        </button>
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          opened.current = true;
          setOpen(true);
        }}
        className="tlink min-h-11 cursor-pointer text-small"
      >
        Have a promo code?
      </button>
    );
  }

  return (
    <div>
      <label htmlFor={`${id}-code`} className="block text-small font-medium">
        Promo code
      </label>
      <div className="mt-2 flex gap-2">
        <input
          ref={input}
          id={`${id}-code`}
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={50}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void apply();
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-11 w-full min-w-0 rounded-[8px] border border-rule-strong bg-surface px-3 text-small uppercase aria-[invalid=true]:border-error"
        />
        <button
          type="button"
          onClick={apply}
          disabled={disabled || state !== "idle"}
          aria-busy={state === "checking" || undefined}
          className="btn btn-m btn-ink shrink-0 cursor-pointer disabled:cursor-wait"
        >
          {state === "checking" ? "Checking…" : "Apply"}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-small text-error">
          {error}
        </p>
      )}
    </div>
  );
}
