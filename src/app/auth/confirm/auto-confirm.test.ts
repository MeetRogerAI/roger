import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pressesItself } from "@/lib/auth/login-link";

describe("the confirm page pressing its own button", () => {
  it("does so for links that sign someone in, and never for a change of email address", () => {
    expect(pressesItself("signin")).toBe(true);
    expect(pressesItself("pilot")).toBe(true);
    expect(pressesItself("email_change")).toBe(false);
    expect(pressesItself("email_approve")).toBe(false);
  });

  it("keeps the form and its button on the page, so a fetch alone changes nothing and no script is needed", () => {
    const page = readFileSync(path.join(process.cwd(), "src/app/auth/confirm/page.tsx"), "utf8");
    expect(page).toContain("<form action={confirmSignIn}");
    expect(page).toContain('<button type="submit"');
    expect(page).toContain("{pressesItself(purpose) ? <AutoConfirm /> : null}");
    // The press happens in the browser only: the page itself never uses the token.
    expect(page).not.toMatch(/consumeToken|createSession/);
  });
});
