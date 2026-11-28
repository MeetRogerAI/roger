/**
 * Every test file reads the release file as the empty overlay (plan KTD13), whatever
 * src/data/site/released.json holds after a release snapshot. The tests that pin the
 * code copy (the homepage, the pages, the claims, the Pages screens) keep proving the
 * code copy, and a snapshot never breaks one of them.
 *
 * The real file is held to the strict reading, and every covered page is rendered with
 * it, in src/data/site/released.test.ts, which unmocks it. A test that needs a release
 * file of its own mocks the module itself (src/lib/site/content/read.test.ts), or hands
 * the functions a release overlay and a baseline (most of src/lib/site/content).
 */
import { vi } from "vitest";

vi.mock("@/data/site/released.json", () => ({ default: { format: 1, lists: {}, sections: {}, text: {} } }));
