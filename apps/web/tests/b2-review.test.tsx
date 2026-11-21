import { afterEach, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { Post } from "@jot/contracts";
import { defaultAppearance } from "@jot/contracts";
import { mockNavigation } from "./mock-navigation";

mockNavigation();

const originalFetch = globalThis.fetch;
let root: Root | null = null;
beforeAll(() => {
  const window = new Window({ url: "http://localhost/" });
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    location: window.location,
    history: window.history,
    localStorage: window.localStorage,
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
const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll("button")].find((el) => el.textContent?.includes(text))!;

test("a subscriber's Remove button is disabled while its request runs", async () => {
  let finish!: () => void;
  globalThis.fetch = (async (_url: string, options?: RequestInit) => {
    if (options?.method === "DELETE") {
      await new Promise<void>((resolve) => (finish = resolve));
      return new Response(null, { status: 204 });
    }
    return Response.json({
      total: 2,
      items: [
        { id: "1", email: "a@x.io", createdAt: "2026-01-01T00:00:00Z" },
        { id: "2", email: "b@x.io", createdAt: "2026-01-01T00:00:00Z" },
      ],
    });
  }) as typeof fetch;
  const { Subscribers } = await import("../src/app/settings/account-sections");
  const container = await mount(<Subscribers />);
  const remove = container.querySelector('button[aria-label="Remove a@x.io"]') as HTMLButtonElement;
  await act(async () => remove.click());
  expect(remove.disabled).toBe(true);
  expect(
    (container.querySelector('button[aria-label="Remove b@x.io"]') as HTMLButtonElement).disabled,
  ).toBe(false);
  await act(async () => finish());
  expect(container.textContent).not.toContain("a@x.io");
});

test("show more skips subscribers already on the list", async () => {
  const person = (id: string) => ({ id, email: `${id}@x.io`, createdAt: "2026-01-01T00:00:00Z" });
  const people = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => person(String(from + i)));
  globalThis.fetch = (async (url: string) => {
    const offset = Number(new URL(url, "http://x").searchParams.get("offset"));
    // A new subscriber between pages pushes row 49 onto page two as well.
    return Response.json({ total: 52, items: offset ? people(49, 52) : people(0, 50) });
  }) as typeof fetch;
  const { Subscribers } = await import("../src/app/settings/account-sections");
  const container = await mount(<Subscribers />);
  await act(async () => button(container, "show more").click());
  const shown = [...container.querySelectorAll("li")].map(
    (li) => li.textContent?.split("since")[0],
  );
  expect(shown).toHaveLength(52);
  expect(shown.slice(48)).toEqual(["48@x.io", "49@x.io", "50@x.io", "51@x.io"]);
});

test("export shows the API's error, and downloads the zip when it works", async () => {
  globalThis.fetch = (async () =>
    Response.json(
      { error: "Export is busy, try again in a minute" },
      { status: 429 },
    )) as unknown as typeof fetch;
  const { ExportSection } = await import("../src/app/settings/account-sections");
  const container = await mount(<ExportSection />);
  await act(async () => button(container, "download zip").click());
  // The API's own reason, in the app's lowercase voice.
  expect(container.textContent).toContain("export is busy, try again in a minute");

  const clicked: string[] = [];
  const click = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    clicked.push(this.download);
  };
  try {
    globalThis.fetch = (async () => new Response(new Blob(["zip"]))) as unknown as typeof fetch;
    await act(async () => button(container, "download zip").click());
  } finally {
    window.HTMLAnchorElement.prototype.click = click;
  }
  expect(clicked).toEqual(["jot-export.zip"]);
  expect(container.textContent).not.toContain("export is busy");
});

test("an expired session keeps local draft copies so unsaved writing survives logging back in", async () => {
  localStorage.setItem("jot:draft:u:p", "{}");
  localStorage.setItem("other", "kept");
  globalThis.fetch = (async (url: string) =>
    url.endsWith("/me")
      ? Response.json({ error: "Unauthorized" }, { status: 401 })
      : Response.json({ aiEnabled: false, emailEnabled: false, domainTarget: "" })) as typeof fetch;
  const { Providers } = await import("../src/components/providers");
  await mount(
    <Providers>
      <p>hi</p>
    </Providers>,
  );
  expect(localStorage.getItem("jot:draft:u:p")).toBe("{}");
});

test("logging out reloads the page instead of racing the private-page redirect", () => {
  const source = readFileSync(new URL("../src/components/shell.tsx", import.meta.url), "utf8");
  const logout = source.slice(source.indexOf("async function logout"));
  expect(logout.slice(0, logout.indexOf("} catch"))).toContain('location.replace("/")');
});

const post: Post = {
  id: "p",
  author: { id: "a", username: "maya", name: "Maya", bio: "", avatar: "" },
  title: "t",
  subtitle: "",
  slug: "t",
  cover: "",
  content: { type: "doc", content: [] },
  appearance: defaultAppearance,
  visibility: "public",
  tags: [],
  revision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  likes: 3,
  comments: 0,
  views: 0,
};

test("on a custom domain, joining in links to the post on the app", async () => {
  const { EngagementPanel } = await import("../src/components/engagement");
  const html = renderToStaticMarkup(
    <EngagementPanel post={post} appPostUrl="https://jot.example/@maya/t" />,
  );
  expect(html).toContain('href="https://jot.example/@maya/t"');
  expect(html).not.toContain('href="/login"');
  expect(renderToStaticMarkup(<EngagementPanel post={post} />)).toContain('href="/login"');
});

test("client components don't pull in the code highlighter", () => {
  for (const file of [
    "components/engagement.tsx",
    "components/post-card.tsx",
    "components/post-parts.tsx",
    "app/settings/page.tsx",
  ]) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    expect(source).not.toMatch(/from "(\.|@\/components)\/document"|code-highlight|lowlight/);
  }
});

test("the dashboard flags a refused scheduled publish", async () => {
  globalThis.fetch = (async (url: string) => {
    if (url.endsWith("/me")) return Response.json(post.author);
    if (url.endsWith("/config"))
      return Response.json({ aiEnabled: false, emailEnabled: false, domainTarget: "" });
    return Response.json({
      posts: [
        {
          ...post,
          excerpt: "",
          readingMinutes: 1,
          isPublished: false,
          scheduleError: "the slug is taken",
        },
      ],
    });
  }) as typeof fetch;
  const { Providers } = await import("../src/components/providers");
  const { default: Dashboard } = await import("../src/app/dashboard/page");
  const container = await mount(
    <Providers>
      <Dashboard />
    </Providers>,
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  const badge = [...container.querySelectorAll("span")].find(
    (span) => span.textContent === "schedule failed",
  );
  expect(badge?.getAttribute("title")).toBe("the slug is taken");
});
