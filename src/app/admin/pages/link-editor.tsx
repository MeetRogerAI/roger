"use client";

import { useState } from "react";

/**
 * Where a link of the header or the footer goes (plan U8, R9): picked from a plain list of the site's pages and
 * their sections ("Home — Price section"), or typed as an address after "Another address".
 *
 * What the owner picks or types is the field's text, held by the page's form like every other text (field-editor.tsx),
 * so it survives a move of its item and a refused save. Nothing is checked here: the save checks the address
 * (src/lib/site/content/text.ts, usableDestination) and says beside the field why one is refused. What is allowed
 * is said under the box before anything is typed.
 *
 * This file must not import the registry or the labels: the list of places arrives as a prop.
 */
export type DestinationOption = { href: string; label: string };

const OTHER = "";

export function DestinationBox({
  id,
  value,
  options,
  onChange,
  describedBy,
  invalid,
  className,
}: {
  /**
   * The id of the address box, which a refused save puts the focus in (a place picked from the list is never
   * refused). The select is `<id>-pick`, which the field's own label names.
   */
  id: string;
  value: string;
  options: readonly DestinationOption[];
  onChange: (href: string) => void;
  describedBy: string;
  invalid: boolean;
  className: string;
}) {
  const named = options.some((option) => option.href === value);
  /** True once "Another address" is picked, and for an address that is none of the places listed. */
  const [typing, setTyping] = useState(!named);
  const other = typing || !named;
  return (
    <div className="mt-1.5 space-y-2">
      <select
        id={`${id}-pick`}
        value={other ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setTyping(true);
            return;
          }
          setTyping(false);
          onChange(e.target.value);
        }}
        aria-describedby={other ? `${id}-help` : describedBy}
        aria-invalid={!other && invalid ? true : undefined}
        // The field's name is the select's label; the place it says is its value.
        className={`${className} h-11 min-w-0`}
      >
        {options.map((option) => (
          <option key={option.href} value={option.href}>
            {option.label}
          </option>
        ))}
        <option value={OTHER}>Another address (type it below)</option>
      </select>
      {other && (
        <div>
          <label htmlFor={id} className="text-meta font-[600] text-ink-2">
            The address
          </label>
          <input
            id={id}
            type="text"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={`${id}-help ${describedBy}`}
            aria-invalid={invalid ? true : undefined}
            className={`${className} h-11 font-mono`}
          />
        </div>
      )}
      <p id={`${id}-help`} className="text-meta text-ink-2">
        {other
          ? "A page of this site starts with “/” (such as /zack or /faq#price-and-billing), another site with “https://”, an email address with “mailto:”. Nothing else is accepted. A link to another site opens in the same tab, like every link of the site."
          : `Goes to ${value}.`}
      </p>
    </div>
  );
}
