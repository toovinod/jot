import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PostSummary } from "@jot/contracts";
import { PostCard } from "../src/components/post-card";
test("renders a bounded summary without accessing a full document or publication snapshot", () => {
  const post: PostSummary = {
    id: "post",
    author: { id: "author", username: "writer", name: "Writer", bio: "", avatar: "" },
    title: "A public story",
    subtitle: "",
    slug: "a-public-story",
    cover: "",
    visibility: "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    publishedAt: "2026-01-01T00:00:00Z",
    revision: 3,
    likes: 2,
    comments: 1,
    excerpt: "A small readable excerpt.",
    readingMinutes: 7,
    isPublished: true,
  };
  const html = renderToStaticMarkup(<PostCard post={post} />);
  expect(html).toContain("A public story");
  expect(html).toContain("A small readable excerpt.");
  expect(html).toContain("7 min read");
  expect(html).toContain("/@writer/a-public-story");
});
