import { afterEach, describe, expect, it } from "vitest";
import { appUrl, renderEmail } from "./layout";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("renderEmail", () => {
  it("escapes every piece of text in the HTML", () => {
    const r = renderEmail({ subject: "s", heading: "<b>hi</b>", paragraphs: ['a "quote" & <tag>'], button: { label: "Go", url: 'https://x.test/?a=1&b="2"' } });
    expect(r.html).not.toContain("<b>hi</b>");
    expect(r.html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(r.html).toContain("&amp; &lt;tag&gt;");
    expect(r.html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
  });

  it("gives the same words in plain text, with the button as a link", () => {
    const r = renderEmail({ subject: "s", heading: "Head", paragraphs: ["One.", "Two."], button: { label: "Open", url: "https://x.test" }, after: ["Free list 1 of 2."] });
    expect(r.text).toContain("Head\n\nOne.\n\nTwo.\n\nOpen: https://x.test\n\nFree list 1 of 2.");
  });
});

describe("appUrl", () => {
  it("never points local work at production", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.APP_URL;
    process.env.SITE_URL = "https://meetroger.ai";
    expect(appUrl("/app")).toBe("http://localhost:3000/app");
  });

  it("uses the branch address on a preview", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_BRANCH_URL = "roger-git-feat-x.vercel.app";
    process.env.SITE_URL = "https://meetroger.ai";
    expect(appUrl("/auth/confirm")).toBe("https://roger-git-feat-x.vercel.app/auth/confirm");
  });

  it("uses the site address on production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.SITE_URL = "https://meetroger.ai/";
    expect(appUrl("app")).toBe("https://meetroger.ai/app");
  });
});
