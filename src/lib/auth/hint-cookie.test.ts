import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasSignedInHint, SIGNED_IN_MARK, SIGNED_IN_MARK_SCRIPT } from "./hint-cookie";

describe("hasSignedInHint", () => {
  it("is false with no cookies", () => {
    expect(hasSignedInHint("")).toBe(false);
  });

  it("is true with the marker cookie among others", () => {
    expect(hasSignedInHint("a=1; roger-in=1; b=2")).toBe(true);
  });

  it("ignores a cookie with a similar name or another value", () => {
    expect(hasSignedInHint("roger-in-x=1")).toBe(false);
    expect(hasSignedInHint("roger-in=0")).toBe(false);
  });
});

/** Runs the head script against a stand-in document with these cookies; returns the attributes it set on <html>. */
function run(cookie: string | (() => string)): Record<string, string> {
  const attrs: Record<string, string> = {};
  const document = {
    get cookie() {
      return typeof cookie === "function" ? cookie() : cookie;
    },
    documentElement: { setAttribute: (name: string, value: string) => void (attrs[name] = value) },
  };
  new Function("document", SIGNED_IN_MARK_SCRIPT)(document);
  return attrs;
}

describe("the head script that marks a signed-in visitor before first paint", () => {
  it("is one fixed string, with the fixed hint and nothing from a request", () => {
    expect(SIGNED_IN_MARK_SCRIPT).toBe(
      "try{if(document.cookie.split(';').some(function(c){return c.trim()==='roger-in=1'}))document.documentElement.setAttribute('data-signed-in','')}catch(e){}",
    );
    expect(SIGNED_IN_MARK).toBe("data-signed-in");
  });

  it("cannot end the <script> it sits in", () => {
    expect(SIGNED_IN_MARK_SCRIPT).not.toContain("</");
    expect(SIGNED_IN_MARK_SCRIPT).not.toContain("<!--");
  });

  it("marks exactly when hasSignedInHint says signed in, so React renders what the mark shows", () => {
    for (const cookie of ["", "roger-in=1", "a=1; roger-in=1; b=2", "roger-in=1;x=y", "roger-in-x=1", "roger-in=0", "xroger-in=1", "roger-in=1x"]) {
      expect(SIGNED_IN_MARK in run(cookie), cookie).toBe(hasSignedInHint(cookie));
    }
  });

  it("marks nothing, and throws nothing, when the cookies cannot be read", () => {
    expect(
      run(() => {
        throw new Error("sandboxed");
      }),
    ).toEqual({});
  });

  it("is in the root layout's head script, after the js class", () => {
    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("import { SIGNED_IN_MARK_SCRIPT } from \"@/lib/auth/hint-cookie\";");
    expect(layout).toMatch(/__html: `document\.documentElement\.classList\.add\('js'\);[^`]*;\$\{SIGNED_IN_MARK_SCRIPT\}` \}/);
  });
});
