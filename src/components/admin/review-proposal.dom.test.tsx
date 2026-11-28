// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B3 Unit 10: the /admin/review buttons in a DOM (happy-dom, this file only),
 * with the server actions mocked: pending labels, one message area that
 * takes focus, errors as alerts, and the reject note kept on an error.
 */

const actions = vi.hoisted(() => ({
  approveProposalAction: vi.fn(),
  rejectProposalAction: vi.fn(),
  refreshFromGitHubAction: vi.fn(),
  runReviewNowAction: vi.fn(),
}));
vi.mock("@/app/admin/review/actions", () => actions);

const { ApproveButton, RejectForm, ReviewJobButton, ReviewMessages } = await import("./review-proposal");

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
});
afterEach(cleanup);

/** A promise the test settles itself, to see the pending state. */
function later<T>() {
  let settle!: (v: T) => void;
  const p = new Promise<T>((r) => (settle = r));
  return { p, settle };
}

describe("/admin/review buttons", () => {
  it("approve: shows the pending label, then the result with its pull request link in the message area, focused", async () => {
    const d = later<unknown>();
    actions.approveProposalAction.mockReturnValue(d.p);
    render(
      <ReviewMessages>
        <ApproveButton proposal="abcdefghij" label="Approve and open the pull request" />
      </ReviewMessages>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Approve and open the pull request" }));
    });
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button").textContent).toContain("Working");
    await act(async () => d.settle({ status: "ok", message: "Pull request #12 opened.", link: "https://github.com/MeetRogerAI/roger/pull/12", at: 1 }));
    const region = screen.getByRole("status");
    await waitFor(() => expect(region.textContent).toContain("Proposal abcdefghij: Pull request #12 opened."));
    expect(document.activeElement).toBe(region);
    expect(screen.getByRole("link", { name: "Open the pull request" }).getAttribute("href")).toBe("https://github.com/MeetRogerAI/roger/pull/12");
    expect(actions.approveProposalAction.mock.calls[0][1].get("proposal")).toBe("abcdefghij");
  });

  it("an error shows as an alert, and a link that isn't GitHub's is not shown", async () => {
    actions.approveProposalAction.mockResolvedValue({ status: "error", message: "A different admin must give the second read.", link: "javascript:alert(1)", at: 1 });
    render(
      <ReviewMessages>
        <ApproveButton proposal="abcdefghij" label="Give the second read" />
      </ReviewMessages>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("A different admin must give the second read."));
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("an action that throws gives a plain error, not a crash", async () => {
    actions.refreshFromGitHubAction.mockRejectedValue(new Error("network"));
    render(
      <ReviewMessages>
        <ReviewJobButton job="refresh" />
      </ReviewMessages>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh from GitHub" }));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("didn’t work"));
  });

  it("reject: sends the note, keeps it on an error and empties it once rejected", async () => {
    actions.rejectProposalAction.mockResolvedValueOnce({ status: "error", message: "This proposal is merged and can't be rejected now.", at: 1 });
    actions.rejectProposalAction.mockResolvedValueOnce({ status: "ok", message: "Rejected. The proposal is kept, with who rejected it.", at: 2 });
    render(
      <ReviewMessages>
        <RejectForm proposal="abcdefghij" />
      </ReviewMessages>,
    );
    const box = screen.getByLabelText(/Why reject it/) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Too vague" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("can't be rejected now"));
    expect(box.value).toBe("Too vague");
    expect(actions.rejectProposalAction.mock.calls[0][1].get("note")).toBe("Too vague");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Rejected."));
    expect(box.value).toBe("");
  });

  it("Run now shows that it is running", async () => {
    const d = later<unknown>();
    actions.runReviewNowAction.mockReturnValue(d.p);
    render(
      <ReviewMessages>
        <ReviewJobButton job="run" />
      </ReviewMessages>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    });
    expect(screen.getByRole("button").textContent).toContain("Running");
    await act(async () => d.settle({ status: "ok", message: "Week of 2026-11-23: 2 proposals stored from 9 evidence items.", at: 1 }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("2 proposals stored"));
  });
});
