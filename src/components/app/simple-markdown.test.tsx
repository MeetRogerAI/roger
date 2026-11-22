import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SimpleMarkdown } from "./simple-markdown";

const html = (src: string) => renderToStaticMarkup(<SimpleMarkdown source={src} />);

describe("SimpleMarkdown", () => {
  it("renders headings, lists, bold and code", () => {
    const out = html("## Steps\n1. Open **the inbox**\n2. Run `sync`\n\n- one\n- two");
    expect(out).toContain("<h4");
    expect(out).toContain("<ol");
    expect(out).toContain("<strong");
    expect(out).toContain("<code");
    expect(out).toContain("<ul");
  });

  it("never turns text from a playbook into markup", () => {
    const out = html('<script>alert(1)</script>\n<img src=x onerror="steal()">');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("joins wrapped lines into one paragraph", () => {
    expect(html("first line\nsecond line")).toBe('<div class="space-y-3 "><p>first line second line</p></div>');
  });
});
