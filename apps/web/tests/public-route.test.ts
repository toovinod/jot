import { describe, expect, test } from "bun:test";
import { normalizePublicSlug, normalizePublicUsername } from "../src/lib/public-route";
describe("public dynamic route normalization", () => {
  test("accepts decoded and once-encoded handles supplied by Next", () => {
    expect(normalizePublicUsername("@preview")).toBe("preview");
    expect(normalizePublicUsername("%40preview")).toBe("preview");
    expect(normalizePublicUsername("%40pre%76iew")).toBe("preview");
    expect(normalizePublicUsername("@reader_01")).toBe("reader_01");
  });
  test("accepts canonical and once-encoded slugs", () => {
    expect(normalizePublicSlug("jot-editor-verification")).toBe("jot-editor-verification");
    expect(normalizePublicSlug("jot%2Deditor%2dverification")).toBe("jot-editor-verification");
  });
  test("rejects malformed escapes and double encoding instead of decoding repeatedly", () => {
    for (const value of ["%", "%4", "%GG", "%C0%AF", "%E0%A4%A", "%2540preview", "@pre%2576iew"]) {
      expect(normalizePublicUsername(value)).toBeNull();
    }
    for (const value of ["%", "%GG", "%C0%AF", "jot%252Deditor", "%252e%252e"]) {
      expect(normalizePublicSlug(value)).toBeNull();
    }
  });
  test("rejects path separators, traversal, query fragments, and noncanonical usernames", () => {
    for (const value of [
      "preview",
      "@@preview",
      "@Preview",
      "@..",
      "@pre/view",
      "%40pre%2Fview",
      "%40pre%5Cview",
      "%40preview%00",
      "@ab",
      `@${"a".repeat(33)}`,
      null,
      undefined,
      ["@preview"],
    ]) {
      expect(normalizePublicUsername(value)).toBeNull();
    }
    for (const value of [
      "",
      ".",
      "..",
      "%2e%2e",
      "a/b",
      "a%2Fb",
      "a%5Cb",
      "a?b",
      "a%23b",
      "-a",
      "a-",
      "A",
      "a_b",
      "a".repeat(101),
      null,
    ]) {
      expect(normalizePublicSlug(value)).toBeNull();
    }
  });
});
