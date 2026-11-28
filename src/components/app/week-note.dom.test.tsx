// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B3 Units 5-6 review: the week note form in a DOM (happy-dom, this file
 * only), with the server actions mocked. After a save the box holds the note
 * as stored (normalised), so Save turns off until the text changes again.
 */

const actions = vi.hoisted(() => ({ saveWeekNoteAction: vi.fn(), deleteWeekNoteAction: vi.fn() }));
vi.mock("@/app/app/actions", () => actions);

const { WeekNote } = await import("./week-note");

const WEEK = "2026-12-14";
const box = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const saveButton = () => screen.getByRole("button", { name: /save note/i }) as HTMLButtonElement;

beforeEach(() => {
  actions.saveWeekNoteAction.mockReset();
  actions.deleteWeekNoteAction.mockReset();
});
afterEach(cleanup);

describe("WeekNote", () => {
  it("shows the saved (normalised) note after a save, and turns Save off until it changes", async () => {
    actions.saveWeekNoteAction.mockResolvedValue({ status: "saved", message: "Note saved.", note: "Useful", at: 1 });
    render(<WeekNote week={WEEK} note={null} />);
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "  Useful  " } });
    expect(saveButton().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await waitFor(() => expect(screen.getByText("Note saved.")).toBeTruthy());
    expect(actions.saveWeekNoteAction).toHaveBeenCalledTimes(1);
    expect(box().value).toBe("Useful");
    expect(saveButton().disabled).toBe(true);
    // Typing makes it different from the saved note again.
    fireEvent.change(box(), { target: { value: "Useful, really" } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.change(box(), { target: { value: "Useful" } });
    expect(saveButton().disabled).toBe(true);
  });

  it("keeps what was typed when the save fails", async () => {
    actions.saveWeekNoteAction.mockResolvedValue({ status: "error", message: "Keep your note to 2,000 characters or fewer.", at: 1 });
    render(<WeekNote week={WEEK} note="Old" />);
    fireEvent.change(box(), { target: { value: "New text" } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("2,000 characters"));
    expect(box().value).toBe("New text");
    expect(saveButton().disabled).toBe(false);
  });

  it("compares against the saved note, not the note it was first given", async () => {
    actions.saveWeekNoteAction.mockResolvedValue({ status: "saved", message: "Note saved.", note: "Second", at: 1 });
    render(<WeekNote week={WEEK} note="First" />);
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "Second" } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await waitFor(() => expect(box().value).toBe("Second"));
    expect(saveButton().disabled).toBe(true);
    // The first note is now a change from the saved one.
    fireEvent.change(box(), { target: { value: "First" } });
    expect(saveButton().disabled).toBe(false);
  });
});
