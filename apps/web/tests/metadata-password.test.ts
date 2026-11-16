import { expect, test } from "bun:test";
import { passwordValidationError } from "../src/lib/password";
import { publishedPostMetadata } from "../src/lib/post-metadata";
import { defaultAppearance, type Post } from "@jot/contracts";
test("validates password bytes without truncating Unicode or blocking existing short login passwords", () => {
  expect(passwordValidationError("a".repeat(72))).toBeNull();
  expect(passwordValidationError("a".repeat(73))).toContain("too long");
  expect(passwordValidationError("é".repeat(37))).toContain("too long");
  expect(passwordValidationError("é".repeat(36))).toBeNull();
  expect(passwordValidationError("short")).not.toBeNull();
  expect(passwordValidationError("short", false)).toBeNull();
});
test("unlisted publication metadata discourages indexing while public stories remain indexable", () => {
  const post = {
    title: "Private draft title",
    subtitle: "Draft",
    slug: "story",
    cover: "",
    visibility: "public",
    content: { type: "doc" },
    appearance: defaultAppearance,
    published: {
      title: "Live title",
      subtitle: "Live",
      slug: "story",
      cover: "",
      visibility: "unlisted",
      content: { type: "doc" },
      appearance: defaultAppearance,
    },
  } as Post;
  expect(publishedPostMetadata(post).robots).toEqual({ index: false, follow: false });
  expect(publishedPostMetadata(post).title).toBe("Live title");
  post.published!.visibility = "public";
  expect(publishedPostMetadata(post).robots).toBeUndefined();
});
