import { afterEach, beforeAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { PostSummary } from "@jot/contracts";
import { liveStatus } from "../src/lib/dashboard-stats";
import { greetings, tabTitles } from "../src/app/dashboard/flavor";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {} }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

const originalFetch = globalThis.fetch;
let root: Root | null = null;
beforeAll(() => {
  const window = new Window({ url: "http://localhost/dashboard" });
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    location: window.location,
    history: window.history,
    localStorage: window.localStorage,
    matchMedia: window.matchMedia.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, name, { value, configurable: true });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  globalThis.fetch = originalFetch;
});
async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}
const text = (html: string) => html.replace(/<[^>]+>/g, "");

test("not found is a pixel sky with the lost plane, no italic serif, and ways back", async () => {
  const { default: NotFound } = await import("../src/app/not-found");
  const html = renderToStaticMarkup(<NotFound />);
  expect(text(html)).toContain("this page flew off.");
  expect(text(html)).toContain("/@lost/page");
  expect(text(html)).toContain("404");
  expect(html).toContain('shape-rendering="crispEdges"');
  expect(html).toContain("animate-[fly-off");
  expect(html).not.toContain("<em");
  expect(html).not.toContain("font-serif");
  expect(html).toContain('href="/"');
  expect(html).toContain('href="/discover"');
  expect(html).not.toContain(String.fromCharCode(0x2014));
});

test("the error page's try again calls reset", async () => {
  const { default: ErrorPage } = await import("../src/app/error");
  let resets = 0;
  const container = await mount(<ErrorPage error={new Error("boom")} reset={() => resets++} />);
  const retry = [...container.querySelectorAll("button")].find(
    (el) => el.textContent === "try again",
  )!;
  await act(async () => retry.click());
  expect(resets).toBe(1);
  expect(container.textContent).toContain("this page flew off.");
});

test("the app shell marks the current section and offers a new page", async () => {
  const { AppShell } = await import("../src/components/shell");
  const html = renderToStaticMarkup(
    <AppShell active="bookmarks">
      <p>body</p>
    </AppShell>,
  );
  const anchor = (href: string) => html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))![0];
  expect(anchor("/dashboard\\?tab=bookmarks")).toContain('aria-current="page"');
  expect(anchor("/settings")).not.toContain("aria-current");
  expect(html).toContain('href="/editor/new"');
  expect(html).toContain('aria-label="Open menu"');
  expect(text(html)).toContain("your writing");
  expect(html).toContain("<p>body</p>");
});

test("each app section gets its own little scene on the sidebar hill", async () => {
  const { AppShell } = await import("../src/components/shell");
  const sections = ["mine", "bookmarks", "discover", "settings"] as const;
  const scenes = sections.map((active) =>
    renderToStaticMarkup(
      <AppShell active={active}>
        <p>body</p>
      </AppShell>,
    ),
  );
  // Critter bodies are the only paths filled and outlined in ink; their colors name the cast.
  const cast = (html: string) =>
    [...html.matchAll(/fill="(#[0-9a-f]{6})" stroke="#16140f"/g)].map((m) => m[1]).join(" ");
  expect(new Set(scenes.map(cast)).size).toBe(sections.length);
  for (const html of scenes) {
    expect(html).toContain("animate-[fly-off");
    expect(html).toContain("animate-[hop");
  }
});

test("liveStatus reads the live copy, not the draft", () => {
  const base = { isPublished: true } as PostSummary;
  expect(liveStatus({ ...base, isPublished: false, liveVisibility: undefined })).toBe("draft");
  expect(liveStatus({ ...base, liveVisibility: "public" })).toBe("live");
  expect(liveStatus({ ...base, liveVisibility: "unlisted" })).toBe("unlisted");
});

const summary = (over: Partial<PostSummary>): PostSummary => ({
  id: "p",
  author: { id: "a", username: "harper", name: "Harper", bio: "", avatar: "" },
  title: "t",
  subtitle: "",
  slug: "t",
  cover: "",
  visibility: "public",
  tags: [],
  revision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  likes: 0,
  comments: 0,
  views: 0,
  excerpt: "",
  readingMinutes: 1,
  isPublished: false,
  ...over,
});

test("the dashboard lists pages with status badges, tags and working filters", async () => {
  const posts = [
    summary({
      id: "1",
      title: "slow mornings",
      isPublished: true,
      liveVisibility: "public",
      views: 1200,
      likes: 4,
      tags: ["habits"],
    }),
    summary({ id: "2", title: "notes on tea", isPublished: true, liveVisibility: "unlisted" }),
    summary({ id: "3", title: "half a thought", scheduledAt: "2026-11-20T09:00:00Z" }),
  ];
  globalThis.fetch = (async (url: string) => {
    if (url.endsWith("/me")) return Response.json(posts[0].author);
    if (url.endsWith("/config"))
      return Response.json({ aiEnabled: false, emailEnabled: false, domainTarget: "" });
    return Response.json({ posts });
  }) as typeof fetch;
  const { Providers } = await import("../src/components/providers");
  const { default: Dashboard } = await import("../src/app/dashboard/page");
  const container = await mount(
    <Providers>
      <Dashboard />
    </Providers>,
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  const rows = () =>
    [...container.querySelectorAll('a[aria-label^="Edit "]')].map((el) =>
      el.getAttribute("aria-label"),
    );
  expect(rows()).toEqual(["Edit slow mornings", "Edit notes on tea", "Edit half a thought"]);
  expect(greetings("harper", new Date())).toContain(container.querySelector("h1")!.textContent!);
  expect(tabTitles).toContain(document.title);
  const content = container.textContent!;
  expect(content).toContain("#habits");
  expect(content).toContain("scheduled nov 20, 2026");
  expect(content).toContain("1,200");
  for (const label of ["live", "unlisted", "draft"])
    expect([...container.querySelectorAll("span")].some((span) => span.textContent === label)).toBe(
      true,
    );

  const filter = (label: string) =>
    [...container.querySelectorAll('[aria-label="Filter pages"] button')].find((el) =>
      el.textContent?.startsWith(label),
    ) as HTMLButtonElement;
  await act(async () => filter("drafts").click());
  expect(filter("drafts").getAttribute("aria-pressed")).toBe("true");
  expect(rows()).toEqual(["Edit half a thought"]);
  await act(async () => filter("unlisted").click());
  expect(rows()).toEqual(["Edit notes on tea"]);
});

test("an empty filter offers a way back to every page", async () => {
  const posts = [summary({ id: "1", title: "a draft" })];
  globalThis.fetch = (async (url: string) => {
    if (url.endsWith("/me")) return Response.json(posts[0].author);
    if (url.endsWith("/config"))
      return Response.json({ aiEnabled: false, emailEnabled: false, domainTarget: "" });
    return Response.json({ posts });
  }) as typeof fetch;
  const { Providers } = await import("../src/components/providers");
  const { default: Dashboard } = await import("../src/app/dashboard/page");
  const container = await mount(
    <Providers>
      <Dashboard />
    </Providers>,
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.startsWith(label),
    ) as HTMLButtonElement;
  await act(async () => button("live").click());
  expect(container.textContent).toContain("nothing in this filter yet.");
  await act(async () => button("show all pages").click());
  expect(container.querySelectorAll('a[aria-label^="Edit "]').length).toBe(1);
});
