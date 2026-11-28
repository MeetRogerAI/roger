// @vitest-environment happy-dom
/**
 * Dismissing wording warnings on the review (Peter, November 28, 2026): each has a Dismiss button, the box goes with
 * the last one, focus moves on, a polite message says so, and the publish button reads "Publish" once none is left.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ publishAction: vi.fn(), resetToReleaseAction: vi.fn(), undoPublishAction: vi.fn() }));

const { WordingWarnings } = await import("./wording-warnings");
const { PublishButton } = await import("./publish-controls");
const { DISMISSED_KEY, dismissedFor } = await import("./review-dismissals");

const items = [
  { id: "faq.a:vocabulary", rule: "vocabulary", label: "FAQ, Price: Answer", body: <p>FAQ, Price: Answer</p> },
  { id: "home.sub:numbers", rule: "numbers", label: "Home, Hero: Sub-line", body: <p>Home, Hero: Sub-line</p> },
];
const Review = ({ review = "r1", others = 0 }: { review?: string; others?: number }) => (
  <>
    <WordingWarnings review={review} items={items} />
    <PublishButton review={review} count={2} wording={items.map((i) => i.id)} others={others} />
  </>
);

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("wording warnings on the review", () => {
  it("prints every warning with no Dismiss button before the page's scripts run, and the button reads Publish anyway", () => {
    const html = renderToString(<Review />);
    expect(html.match(/data-warning=/g)).toHaveLength(2);
    expect(html).not.toContain("data-dismiss=");
    expect(html).not.toContain("Dismiss");
    expect(html).toContain("Publish anyway: all 2 changes");
  });

  it("dismisses one, then the other: the count, the focus, the message, the box and the button follow", async () => {
    render(<Review />);
    expect(screen.getByRole("heading", { name: "Wording warnings: 2" })).toBeTruthy();
    const first = screen.getByRole("button", { name: /^Dismiss ?: the warning on FAQ, Price: Answer$/ });
    screen.getByRole("button", { name: /^Dismiss ?: the warning on Home, Hero: Sub-line$/ });
    expect(screen.getByRole("button", { name: /^Publish anyway/ })).toBeTruthy();
    await act(async () => fireEvent.click(first));
    expect(screen.getByRole("heading", { name: "Wording warnings: 1" })).toBeTruthy();
    expect(screen.queryByText("FAQ, Price: Answer")).toBeNull();
    expect((document.activeElement as HTMLElement).getAttribute("data-dismiss")).toBe("home.sub:numbers");
    expect(document.querySelector("[data-dismiss-status]")!.textContent).toBe("Warning dismissed. 1 wording warning left.");
    expect(screen.getByRole("button", { name: /^Publish anyway/ })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Dismiss/ })));
    expect(document.querySelector("[data-warnings]")).toBeNull();
    const publish = screen.getByRole("button", { name: "Publish all 2 changes" });
    expect(document.activeElement).toBe(publish);
    expect(document.querySelector("[data-dismiss-status]")!.textContent).toBe("All wording warnings dismissed.");
    // Kept for this review, in sessionStorage.
    expect(dismissedFor(sessionStorage.getItem(DISMISSED_KEY), "r1")).toEqual(["faq.a:vocabulary", "home.sub:numbers"]);
  });

  it("keeps Publish anyway while a link or page warning is left", async () => {
    render(<Review others={1} />);
    for (const button of screen.getAllByRole("button", { name: /^Dismiss/ })) await act(async () => fireEvent.click(button));
    expect(screen.getByRole("button", { name: "Publish anyway: all 2 changes" })).toBeTruthy();
  });

  it("keeps a dismissed warning gone on a reload of the same review, and brings it back for a changed one", async () => {
    render(<Review />);
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: /^Dismiss/ })[0]));
    cleanup();
    render(<Review />);
    expect(screen.getAllByRole("button", { name: /^Dismiss/ })).toHaveLength(1);
    cleanup();
    render(<Review review="r2" />);
    expect(screen.getAllByRole("button", { name: /^Dismiss/ })).toHaveLength(2);
  });

  it("reads nothing it does not understand as dismissed", () => {
    for (const stored of [null, "", "[", "[]", '"r1"', '{"review":"r1"}', '{"review":"r1","ids":"x"}', '{"review":"r0","ids":["a"]}']) expect(dismissedFor(stored, "r1"), String(stored)).toEqual([]);
    expect(dismissedFor('{"review":"r1","ids":["a",5,"b"]}', "r1")).toEqual(["a", "b"]);
  });
});
