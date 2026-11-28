// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Found on preview, 2026-11-27: after the first step ("Change sharing")
 * answered, React 19 reset the form and the radios showed the old choice
 * again, so "Confirm the change" sent the old value and the server said
 * "That's already your setting". No member could change sharing.
 */

const actions = vi.hoisted(() => ({ changeSharing: vi.fn(), newKey: vi.fn(), saveSettings: vi.fn(), uploadReport: vi.fn() }));
vi.mock("@/app/app/zack/actions", () => actions);

const { SharingForm } = await import("./zack-controls");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the sharing form", () => {
  it("confirms the choice the member picked, not the one the form started with", async () => {
    actions.changeSharing.mockImplementation(async (_p: unknown, fd: FormData) =>
      fd.get("confirm") === "yes" ? { status: "saved", sharing: fd.get("sharing") } : { status: "confirm", sharing: fd.get("sharing"), effect: "Your price changes." },
    );
    render(<SharingForm current="share" />);
    fireEvent.click(screen.getByLabelText(/Zack off/));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Change sharing" })));
    const confirm = await screen.findByRole("button", { name: "Confirm the change" });
    // What is on screen still matches the pick.
    expect((screen.getByLabelText(/Zack off/) as HTMLInputElement).checked).toBe(true);
    await act(async () => fireEvent.click(confirm));
    await waitFor(() => expect(actions.changeSharing).toHaveBeenCalledTimes(2));
    const second = actions.changeSharing.mock.calls[1][1] as FormData;
    expect(second.get("sharing")).toBe("off");
    expect(second.get("confirm")).toBe("yes");
  });
});
