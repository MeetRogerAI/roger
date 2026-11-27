---
title: A full-page screenshot taller than 16,384 device pixels shows the page twice
date: 2026-11-27
category: docs/solutions/developer-experience/
module: tooling
problem_type: developer_experience
component: tooling
severity: medium
applies_when:
  - Taking a full-page screenshot of a long screen with headless Chrome over the DevTools protocol
  - The viewport is emulated at a phone's size with deviceScaleFactor 2 or more
  - A picture seems to show a header, a heading or a whole screen a second time lower down
tags: [screenshots, headless-chrome, cdp, device-scale-factor, browser-checks, false-alarm]
---

# A full-page screenshot taller than 16,384 device pixels shows the page twice

## Context
The U6 browser check photographed the Home editing screen (`/admin/pages/home`) at 375 pixels wide by setting the emulated viewport's height to the page's height and calling `Page.captureScreenshot`. The picture showed the whole screen, and then, after the last fields, the site header, the "Menu" bar, the "Home" heading and the sections panel again. It looked like a duplicated screen, which on this codebase is a plausible fault: Next 16 keeps the screen a click has left in the document, hidden (`docs/solutions/ui-bugs/next16-hidden-page-runs-mount-effects-again-2026-11-27.md`).

It was the picture. The page was 10,911 CSS pixels tall and the viewport was emulated with `deviceScaleFactor: 2`, so the capture was 21,822 device pixels tall. Chrome paints a capture into one GPU texture, which is at most 16,384 pixels on a side. Past that line it starts again from the top of the page. In the picture the second copy began at device pixel 16,384 exactly.

## Guidance
- Before believing a duplicated screen in a picture, ask the document: `document.querySelectorAll("h1").length`, the count of the suspect panel, whether each copy can be seen (`offsetParent !== null`), and `document.documentElement.scrollHeight`. On a fresh load the screen had one `h1`, one panel and no id twice.
- Check what a real window shows: set the phone's own height (812), `window.scrollTo(0, document.documentElement.scrollHeight)`, and take the viewport. The bottom of the screen was the footer.
- For a full-page picture, keep `height * deviceScaleFactor` under 16,384. The simple way is to capture the full page at `deviceScaleFactor: 1` (and keep 2 for viewport-sized pictures, where sharpness matters). Cut a page that is still too tall into several captures.
- A sign that it is the picture: the repeat starts at a round device-pixel line (16,384), not at an element's edge, and the second copy starts from the very top of the page, site header included.

## Why This Matters
A reviewer who sees the screen twice either chases a layout fault that is not there or, worse, learns to distrust the pictures and stops looking at them. The same script had taken the public homepage at 375 the same way, so those pictures were at risk too.

## When to Apply
Any scripted full-page screenshot in this repo's browser checks, above all at phone width, where pages are tallest and the scale factor is 2.

## Examples
Before (repeats past 16,384 device pixels):
```js
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: pageHeight, deviceScaleFactor: 2, mobile: true });
await send("Page.captureScreenshot", { format: "png" });
```
After:
```js
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: Math.min(pageHeight, 16000), deviceScaleFactor: 1, mobile: true });
await send("Page.captureScreenshot", { format: "png" });
```

## Related
- `docs/solutions/ui-bugs/next16-hidden-page-runs-mount-effects-again-2026-11-27.md`: the real way a screen can be in the document twice, and why ids must differ between screens.
