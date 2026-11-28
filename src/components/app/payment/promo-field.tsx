"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PromoView } from "@/lib/billing/payment-view";

/**
 * "Have a promo code?" (plan 2026-11-26-001, Unit 6; origin R17): a quiet
 * link that opens one field and an Apply button. The code is checked on the
 * server; any refusal reads the same generic line, and the field keeps what
 * was typed. An applied code shows with a Remove control. Not a form: it sits
 * beside the card form and must never submit or reset it. Focus follows the
 * change: to Remove after Apply, back to "Have a promo code?" after Remove.
 * `disabled`: another change on the page is in flight.
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
  /** Resolves to an error message, or null when the code was removed. */
  onRemove: () => Promise<string | null>;
  disabled?: boolean;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "removing">("idle");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const openLink = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  // Where focus goes once the change has rendered.
  const focusNext = useRef<"remove" | "link" | null>(null);
  const id = useId();

  useEffect(() => {
    // Focus the field when the person opened it (not on first render).
    if (open && opened.current) input.current?.focus();
  }, [open]);

  useEffect(() => {
    const target = focusNext.current === "remove" ? removeButton.current : focusNext.current === "link" ? openLink.current : null;
    if (!target) return;
    focusNext.current = null;
    target.focus();
  }, [promo, open, state]);

  async function apply() {
    if (state !== "idle" || disabled) return;
    if (!code.trim()) {
      setError("Enter a code.");
      input.current?.focus();
      return;
    }
    setState("checking");
    setError(null);
    const message = await onApply(code).catch(() => "We couldn’t check that code. Try again.");
    if (message) {
      setState("idle");
      setError(message);
      input.current?.focus();
      return;
    }
    setCode("");
    opened.current = false;
    setOpen(false);
    focusNext.current = "remove";
    setState("idle");
  }

  async function remove() {
    if (state !== "idle" || disabled) return;
    setState("removing");
    setError(null);
    const message = await onRemove().catch(() => "We couldn’t remove the code. Try again.");
    if (message) {
      setError(message);
      focusNext.current = "remove";
    } else {
      opened.current = false;
      setOpen(false);
      focusNext.current = "link";
    }
    setState("idle");
  }

  if (promo) {
    return (
      <div className="text-small">
        <p className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Code <strong className="font-semibold">{promo.code}</strong> applied
          </span>
          <button
            ref={removeButton}
            type="button"
            onClick={remove}
            disabled={disabled || state !== "idle"}
            aria-describedby={error ? `${id}-error` : undefined}
            className="tlink min-h-11 cursor-pointer disabled:cursor-wait"
          >
            {state === "removing" ? "Removing…" : "Remove"}
          </button>
        </p>
        {error && (
          <p id={`${id}-error`} role="alert" className="mt-2 text-error">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        ref={openLink}
        type="button"
        onClick={() => {
          opened.current = true;
          setError(null);
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
