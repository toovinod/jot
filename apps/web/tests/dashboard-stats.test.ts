import { expect, test } from "bun:test";
import type { PostSummary } from "@jot/contracts";
import { greeting, loadAllMine, summarize } from "../src/lib/dashboard-stats";

function post(id: number, isPublished: boolean, likes = 0): PostSummary {
  return {
    id: String(id),
    author: { id: "a", username: "maya", name: "Maya", bio: "", avatar: "" },
    title: "t",
    subtitle: "",
    slug: `s${id}`,
    cover: "",
    visibility: "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    revision: 1,
    likes,
    comments: 0,
    excerpt: "",
    readingMinutes: 1,
    isPublished,
  };
}

test("summarize counts live pages, drafts and likes", () => {
  expect(summarize([post(1, true, 3), post(2, true, 2), post(3, false)])).toEqual({
    live: 2,
    drafts: 1,
    likes: 5,
  });
});

test("loadAllMine pages until a short page", async () => {
  const all = Array.from({ length: 120 }, (_, i) => post(i, true));
  const offsets: number[] = [];
  const result = await loadAllMine(async (offset, limit) => {
    offsets.push(offset);
    return all.slice(offset, offset + limit);
  });
  expect(offsets).toEqual([0, 50, 100]);
  expect(result.length).toBe(120);
});

test("loadAllMine rejects when a page fails", async () => {
  let calls = 0;
  const failing = loadAllMine(async (offset, limit) => {
    if (calls++ === 1) throw new Error("network");
    return Array.from({ length: limit }, (_, i) => post(offset + i, false));
  });
  await expect(failing).rejects.toThrow("network");
});

test("greeting follows the clock", () => {
  expect(greeting(new Date(2026, 0, 1, 9))).toBe("morning");
  expect(greeting(new Date(2026, 0, 1, 12))).toBe("afternoon");
  expect(greeting(new Date(2026, 0, 1, 18))).toBe("evening");
});
