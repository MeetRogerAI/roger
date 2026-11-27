"use client";

import { useEffect, useRef } from "react";

/*
 * Focus for results that arrive as a new server render (B2 Unit 9 review):
 * after "Send the invitation" or "I'm coming" succeeds, the page refreshes
 * and the form is replaced by a result block. A form marks that a result is
 * coming when it submits; the block that mounts next takes focus, so screen
 * readers announce it. A form that ends in an error clears the mark.
 */
let pending = false;
export const expectResult = () => {
  pending = true;
};
export const clearExpectedResult = () => {
  pending = false;
};

/** A live region (role=status) that takes focus when it replaces a form that just succeeded. */
export function ResultStatus({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pending) return;
    pending = false;
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} id={id} role="status" tabIndex={-1} className={`outline-none focus-visible:ring-2 ${className ?? ""}`}>
      {children}
    </div>
  );
}
