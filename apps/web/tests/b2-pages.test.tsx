import { afterEach, beforeAll, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { PostSummary } from "@jot/contracts";

let params = new URLSearchParams();
mock.module("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {} }),
  usePathname: () => "/",
  useSearchParams: () => params,
  notFound: () => {
    throw new Error("not found");
  },
}));
mock.module("server-only", () => ({}));

const originalFetch = globalThis.fetch;
let requests: string[] = [];
let root: Root | null = null;
beforeAll(() => {
  const window = new Window({ url: "http://localhost/" });
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    location: window.location,
    history: window.history,
    HTMLElement: window.HTMLElement,
    IntersectionObserver: Observer,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, name, { value, configurable: true });
  Object.defineProperty(window, "IntersectionObserver", { value: Observer, configurable: true });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  globalThis.fetch = originalFetch;
  params = new URLSearchParams();
  requests = [];
});

async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}
function respond(handler: (url: string) => unknown) {
  globalThis.fetch = (async (url: string, options?: RequestInit) => {
    requests.push(`${options?.method || "GET"} ${url}`);
    const [status, body] = handler(url) as [number, unknown];
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}
const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll("button")].find((el) => el.textContent?.includes(text))!;

function post(id: string, tags: string[] = []): PostSummary {
  return {
    id,
    author: { id: "a", username: "maya", name: "Maya", bio: "", avatar: "" },
    title: `post ${id}`,
    subtitle: "",
    slug: `post-${id}`,
    cover: "",
    visibility: "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    publishedAt: "2026-01-01T00:00:00Z",
    revision: 1,
    likes: 0,
    comments: 0,
    views: 0,
    tags,
    excerpt: "",
    readingMinutes: 1,
    isPublished: true,
  };
}

test("post cards link each tag to discover", async () => {
  const { PostCard } = await import("../src/components/post-card");
  const html = renderToStaticMarkup(<PostCard post={post("1", ["postgres", "scaling"])} />);
  expect(html).toContain('href="/discover?tag=postgres"');
  expect(html).toContain("#scaling");
});

test("discover filters by the tag in the url and shows a clear chip", async () => {
  params = new URLSearchParams("tag=postgres");
  respond(() => [200, { posts: [post("1", ["postgres"])] }]);
  const { default: Discover } = await import("../src/app/discover/page");
  const container = await mount(<Discover />);
  await act(async () => new Promise((resolve) => setTimeout(resolve, 260)));
  expect(requests.some((r) => r.includes("/api/posts?") && r.includes("&tag=postgres"))).toBe(true);
  const chip = container.querySelector('a[aria-label="Clear tag postgres"]')!;
  expect(chip.getAttribute("href")).toBe("/discover");
});

test("profile loads more pages and links the feed", async () => {
  const { ProfilePosts } = await import("../src/app/[handle]/profile-posts");
  const first = Array.from({ length: 2 }, (_, i) => post(String(i)));
  respond(() => [200, { author: first[0].author, posts: [post("2")] }]);
  const container = await mount(<ProfilePosts username="maya" initial={first} pageSize={2} />);
  expect(container.querySelector('a[href="/@maya/rss.xml"]')).not.toBeNull();
  expect(container.textContent).toContain("2+ pages published");
  await act(async () => button(container, "load more pages").click());
  expect(requests).toEqual(["GET /api/authors/maya?offset=2&limit=2"]);
  expect(container.textContent).toContain("post 2");
  expect(container.textContent).toContain("3 pages published");
  expect(button(container, "load more pages")).toBeUndefined();
});

test("profile shows no stand-in bio", () => {
  const source = readFileSync(new URL("../src/app/[handle]/page.tsx", import.meta.url), "utf8");
  expect(source).not.toContain("A space for thoughts");
});

test("an expired verification link offers a new one", async () => {
  history.replaceState(null, "", "/auth/verify?token=old");
  respond(() => [400, { error: "Invalid or expired verification token", code: "invalid_token" }]);
  const { default: Verify } = await import("../src/app/auth/verify/page");
  const container = await mount(<Verify />);
  await act(async () => button(container, "verify email").click());
  expect(requests).toEqual(["POST /api/auth/verification/confirm"]);
  expect(container.textContent).toContain("this link has expired");
  const login = container.querySelector('a[href="/login?next=%2Fsettings"]');
  expect(login?.textContent).toContain("log in to send a new link");
});

test("logging out never uses a browser alert", () => {
  const source = readFileSync(new URL("../src/components/shell.tsx", import.meta.url), "utf8");
  expect(source).not.toContain("alert(");
});
