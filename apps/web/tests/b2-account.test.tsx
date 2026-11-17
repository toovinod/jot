import { afterEach, expect, test } from "bun:test";
import type { PostSummary } from "@jot/contracts";
import { allSubscribers, getDomain, subscribersCsv } from "../src/lib/account-api";
import { matches } from "../src/lib/dashboard-stats";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function summary(extra: Partial<PostSummary>): PostSummary {
  return {
    id: "p",
    author: { id: "a", username: "maya", name: "Maya", bio: "", avatar: "" },
    title: "t",
    subtitle: "",
    slug: "t",
    cover: "",
    visibility: "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    revision: 1,
    likes: 0,
    comments: 0,
    views: 0,
    tags: [],
    excerpt: "",
    readingMinutes: 1,
    isPublished: false,
    ...extra,
  };
}

test("unlisted filter follows the live copy, not the draft", () => {
  const liveUnlisted = summary({ isPublished: true, liveVisibility: "unlisted" });
  const draftSaysUnlisted = summary({
    isPublished: true,
    visibility: "unlisted",
    liveVisibility: "public",
  });
  const unpublished = summary({ visibility: "unlisted" });
  expect(matches(liveUnlisted, "unlisted")).toBe(true);
  expect(matches(draftSaysUnlisted, "unlisted")).toBe(false);
  expect(matches(unpublished, "unlisted")).toBe(false);
});

test("csv quotes cells that need it", () => {
  const csv = subscribersCsv([
    { id: "1", email: "a@example.com", createdAt: "2026-01-01T00:00:00Z" },
    { id: "2", email: 'odd,"name"@example.com', createdAt: "2026-01-02T00:00:00Z" },
  ]);
  expect(csv).toBe(
    'email,subscribed\na@example.com,2026-01-01T00:00:00Z\n"odd,""name""@example.com",2026-01-02T00:00:00Z',
  );
});

test("csv cells that a spreadsheet would run as a formula are defused", () => {
  const csv = subscribersCsv(
    ["=HYPERLINK(1)", "+1@x.io", "-1@x.io", "@x.io", "\tx@x.io", "\rx@x.io"].map((email, i) => ({
      id: String(i),
      email,
      createdAt: "2026-01-01T00:00:00Z",
    })),
  );
  expect(csv.split("\n").slice(1, 5)).toEqual([
    `"'=HYPERLINK(1)",2026-01-01T00:00:00Z`,
    `"'+1@x.io",2026-01-01T00:00:00Z`,
    `"'-1@x.io",2026-01-01T00:00:00Z`,
    `"'@x.io",2026-01-01T00:00:00Z`,
  ]);
  expect(csv).toContain(`"'\tx@x.io"`);
  expect(csv).toContain(`"'\rx@x.io"`);
});

test("csv download reads every subscriber page", async () => {
  const offsets: string[] = [];
  const all = Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    email: `${i}@example.com`,
    createdAt: "2026-01-01T00:00:00Z",
  }));
  globalThis.fetch = (async (url: string) => {
    const params = new URL(url, "http://x").searchParams;
    const offset = Number(params.get("offset")),
      limit = Number(params.get("limit"));
    offsets.push(String(offset));
    return json({ total: all.length, items: all.slice(offset, offset + limit) });
  }) as typeof fetch;
  const items = await allSubscribers(2);
  expect(items.map((s) => s.id)).toEqual(["0", "1", "2", "3", "4"]);
  expect(offsets).toEqual(["0", "2", "4"]);
});

test("no custom domain reads as null", async () => {
  globalThis.fetch = (async (_url: string) => json(null)) as typeof fetch;
  expect(await getDomain()).toBeNull();
  globalThis.fetch = (async (_url: string) => json({ error: "Not found" }, 404)) as typeof fetch;
  expect(await getDomain()).toBeNull();
});
