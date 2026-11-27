"use client";

import { useActionState, useEffect, useRef } from "react";
import { joinLeaderboardAction, leaveLeaderboardAction, type JoinState, type LeaveState } from "@/app/app/leaderboard/actions";
import { NAME_MAX, NAME_MIN } from "@/lib/growth/leaderboard-name";

const input = "mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 text-small outline-none focus:border-ink";
const label = "block text-meta font-[600] text-ink-2";

/**
 * The name field. Keyed by the parent on the shown value, so React 19's form
 * reset lands on the saved name (after a save) or what was typed (after an
 * error), never an older one. On an error it takes focus when it mounts.
 */
function NameField({ shown, error, onBoard }: { shown: string; error: boolean; onBoard: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  return (
    <div>
      <label htmlFor="lb-name" className={label}>
        {onBoard ? "Your name on the board" : "The name to show on the board"}
      </label>
      <input
        ref={ref}
        id="lb-name"
        name="displayName"
        defaultValue={shown}
        required
        minLength={NAME_MIN}
        maxLength={NAME_MAX + 10}
        autoComplete="nickname"
        aria-invalid={error}
        aria-describedby="lb-name-help lb-name-msg"
        className={input}
      />
      <p id="lb-name-help" className="mt-1 text-meta text-ink-2">
        {NAME_MIN} to {NAME_MAX} characters: Latin letters (accents are fine), numbers, spaces and . ’ - &amp;. Other members see this name, your rank and your points.
      </p>
    </div>
  );
}

/**
 * Join (or rename) and "Leave the board", sharing one pending flag so neither
 * can be pressed while the other runs. `paused`: the leaderboard is switched
 * off, so only Leave is offered. Rendered in the same place whatever the
 * member's state, so the "You've left the board." confirmation survives the
 * refresh that follows a leave.
 */
export function LeaderboardControls({ current, onBoard, paused }: { current: string; onBoard: boolean; paused: boolean }) {
  const [join, joinAction, joining] = useActionState<JoinState, FormData>(joinLeaderboardAction, { status: "idle" });
  const [leave, leaveAction, leaving] = useActionState<LeaveState>(leaveLeaderboardAction, { status: "idle" });
  const busy = joining || leaving;
  const left = leave.status === "left" && !onBoard && (leave.at ?? 0) > (join.at ?? 0);
  const leftRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (left) leftRef.current?.focus();
  }, [left]);
  const shown = join.name ?? current;
  const error = join.status === "error";
  return (
    <div className="space-y-3">
      {!paused && (
        <form action={joinAction} className="space-y-3">
          <NameField key={`${shown}:${join.at ?? ""}`} shown={shown} error={error} onBoard={onBoard} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className="btn btn-s">
              {joining ? "Saving…" : onBoard ? "Change name" : "Join the board"}
            </button>
            <p id="lb-name-msg" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} className={`text-small ${error ? "text-error" : "text-ink-2"}`}>
              {join.status !== "idle" && !left ? (join.message ?? "") : ""}
            </p>
          </div>
        </form>
      )}
      {onBoard && (
        <form action={leaveAction}>
          <button type="submit" disabled={busy} className="tlink inline-flex min-h-11 items-center text-small">
            {leaving ? "Leaving…" : "Leave the board"}
          </button>
        </form>
      )}
      <p ref={leftRef} tabIndex={-1} role="status" aria-live="polite" className="text-small text-ink-2 outline-none">
        {left ? "You’ve left the board." : ""}
      </p>
    </div>
  );
}
