import { expect, mock, test } from "bun:test";
import { defaultAppearance, type Post, type Snapshot } from "@jot/contracts";
mock.module("next/headers", () => ({
  headers: async () => new Headers({ host: "jot.example", "x-forwarded-proto": "https" }),
}));
const { publicOrigin, publishedPostMetadata, requestOrigin } =
  await import("../src/lib/post-metadata");
const { default: sitemap } = await import("../src/app/sitemap");
const { default: robots } = await import("../src/app/robots");
const { default: nextConfig } = await import("../next.config");
const live: Snapshot = {
  title: "Live title",
  subtitle: "Live subtitle",
  slug: "live",
  cover: "/media/cover.png",
  visibility: "public",
  tags: [],
  content: { type: "doc" },
  appearance: defaultAppearance,
};
const post = {
  ...live,
  id: "p",
  title: "Draft title",
  author: { id: "a", username: "maya", name: "Maya", bio: "", avatar: "" },
  publishedAt: "2026-11-01T00:00:00Z",
  published: live,
} as unknown as Post;
test("published pages carry canonical, feed, open graph and twitter metadata from the live copy", () => {
  const metadata = publishedPostMetadata(post, "https://jot.example");
  expect(metadata.title).toBe("Live title");
  expect(metadata.alternates?.canonical).toBe("https://jot.example/@maya/live");
  expect(metadata.alternates?.types).toEqual({
    "application/rss+xml": "https://jot.example/@maya/rss.xml",
  });
  expect(metadata.openGraph).toMatchObject({
    type: "article",
    url: "https://jot.example/@maya/live",
    title: "Live title",
    description: "Live subtitle",
    images: ["https://jot.example/media/cover.png"],
  });
  expect(metadata.twitter).toMatchObject({
    card: "summary_large_image",
    images: ["https://jot.example/media/cover.png"],
  });
  expect(metadata.robots).toBeUndefined();
});
test("unlisted pages stay out of search and coverless pages use a small card", () => {
  const metadata = publishedPostMetadata(
    { ...post, published: { ...live, visibility: "unlisted", cover: "" } } as Post,
    "https://jot.example",
  );
  expect(metadata.robots).toEqual({ index: false, follow: false });
  expect(metadata.twitter).toMatchObject({ card: "summary" });
});
test("the request origin comes from forwarded headers", async () => {
  expect(await requestOrigin()).toBe("https://jot.example");
});
test("canonical addresses use APP_ORIGIN, not the host a custom domain request came in on", async () => {
  const original = { env: process.env.APP_ORIGIN, fetch: globalThis.fetch };
  try {
    process.env.APP_ORIGIN = "https://app.example";
    expect(await publicOrigin()).toBe("https://app.example");
    globalThis.fetch = (async () =>
      Response.json([
        { username: "maya", slug: "hello", updatedAt: "2026-11-01T00:00:00Z" },
      ])) as unknown as typeof fetch;
    expect((await sitemap()).map((entry) => entry.url)).toContain(
      "https://app.example/@maya/hello",
    );
    expect((await robots()).sitemap).toBe("https://app.example/sitemap.xml");
  } finally {
    if (original.env === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = original.env;
    globalThis.fetch = original.fetch;
  }
});
test("the sitemap lists public posts and keeps static pages when the API is down", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      Response.json([
        { username: "maya", slug: "hello", updatedAt: "2026-11-01T00:00:00Z" },
      ])) as unknown as typeof fetch;
    const entries = await sitemap();
    expect(entries.map((entry) => entry.url)).toContain("https://jot.example/@maya/hello");
    globalThis.fetch = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    expect((await sitemap()).map((entry) => entry.url)).toEqual([
      "https://jot.example/",
      "https://jot.example/discover",
      "https://jot.example/privacy",
      "https://jot.example/terms",
    ]);
  } finally {
    globalThis.fetch = original;
  }
});
test("robots keep crawlers out of private app routes and point at the sitemap", async () => {
  const value = await robots();
  expect(value.rules).toEqual({
    userAgent: "*",
    allow: "/",
    disallow: ["/dashboard", "/editor", "/settings"],
  });
  expect(value.sitemap).toBe("https://jot.example/sitemap.xml");
});
test("feeds are served from the API at friendly addresses", async () => {
  const rewrites = (await nextConfig.rewrites!()) as { source: string; destination: string }[];
  expect(rewrites).toContainEqual({
    source: "/rss.xml",
    destination: "http://127.0.0.1:8080/api/rss",
  });
  expect(rewrites).toContainEqual({
    source: "/@:handle/rss.xml",
    destination: "http://127.0.0.1:8080/api/authors/:handle/rss",
  });
});
