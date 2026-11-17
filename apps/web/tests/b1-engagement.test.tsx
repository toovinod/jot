import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { defaultAppearance, type Engagement, type Post, type User } from "@jot/contracts";
import { Providers } from "../src/components/providers";
import { EngagementPanel } from "../src/components/engagement";
import { ViewBeacon } from "../src/app/[handle]/[slug]/view-beacon";
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const author: User = { id: "author", username: "maya", name: "Maya", bio: "", avatar: "" };
const reader: User = { id: "reader", username: "sam", name: "Sam", bio: "", avatar: "" };
const post = {
  id: "p",
  author,
  title: "Live",
  subtitle: "",
  slug: "live",
  cover: "",
  content: { type: "doc", content: [] },
  appearance: defaultAppearance,
  visibility: "public",
  tags: [],
  revision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  likes: 0,
  comments: 2,
  views: 0,
} as Post;
const comment = (id: string, body: string, parentId?: string) => ({
  id,
  body,
  author: reader,
  createdAt: "2026-01-02T00:00:00Z",
  ...(parentId ? { parentId } : {}),
});
beforeAll(() => {
  const window = new Window({ url: "http://localhost/" });
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    localStorage: window.localStorage,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, name, { value, configurable: true });
});
afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
    root = null;
  }
  globalThis.fetch = originalFetch;
});
/** Serves the session, config and engagement, and records every other request. */
function serve(user: User | null, engagement: Engagement, calls: string[]) {
  globalThis.fetch = (async (url, options) => {
    const path = String(url),
      method = options?.method || "GET";
    if (path === "/api/me")
      return user ? Response.json(user) : Response.json({ error: "no" }, { status: 401 });
    if (path === "/api/config")
      return Response.json({ aiEnabled: false, emailEnabled: false, domainTarget: "" });
    if (path.endsWith("/engagement")) return Response.json(engagement);
    calls.push(`${method} ${path} ${options?.body || ""}`.trim());
    return new Response(null, { status: 204 });
  }) as typeof fetch;
}
async function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  const router = { push() {}, replace() {}, prefetch() {} } as unknown as AppRouterInstance;
  await act(async () =>
    root!.render(
      <AppRouterContext.Provider value={router}>
        <Providers>{node}</Providers>
      </AppRouterContext.Provider>,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}
const base: Engagement = {
  liked: false,
  bookmarked: false,
  likes: 0,
  comments: [comment("c1", "top level"), comment("c2", "a reply", "c1")],
  commentsOff: false,
};
describe("comments", () => {
  test("nests one level of replies under their comment and posts a reply with its parent", async () => {
    const calls: string[] = [];
    serve(reader, base, calls);
    const container = await render(<EngagementPanel post={post} />);
    const top = container.querySelector("article")!;
    expect(top.textContent).toContain("top level");
    expect(top.querySelector("article")?.textContent).toContain("a reply");
    const replyButtons = [...container.querySelectorAll("button")].filter(
      (button) => button.textContent === "reply",
    );
    expect(replyButtons).toHaveLength(1);
    await act(async () => (replyButtons[0] as unknown as HTMLButtonElement).click());
    const textarea = container.querySelector("#reply-c1")!;
    const key = Object.keys(textarea).find((k) => k.startsWith("__reactProps$"))!;
    const props = (textarea as unknown as Record<string, { onChange: (e: unknown) => void }>)[key];
    await act(async () => props.onChange({ target: { value: "thanks" } }));
    const submit = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "post reply",
    ) as unknown as HTMLButtonElement;
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(calls).toContain('POST /api/posts/p/comments {"body":"thanks","parentId":"c1"}');
  });
  test("shows the comments-off state without a form or reply buttons", async () => {
    serve(reader, { ...base, commentsOff: true }, []);
    const container = await render(<EngagementPanel post={post} />);
    expect(container.textContent).toContain("comments are off for this page.");
    expect(container.querySelector("#comment")).toBeNull();
    expect([...container.querySelectorAll("button")].some((b) => b.textContent === "reply")).toBe(
      false,
    );
    expect(container.textContent).toContain("top level");
  });
});
describe("view beacon", () => {
  test("counts one read for a reader", async () => {
    const calls: string[] = [];
    serve(null, base, calls);
    await render(<ViewBeacon postId="p" authorId="author" />);
    expect(calls).toEqual(["POST /api/posts/p/view"]);
  });
  test("skips the author's own visit", async () => {
    const calls: string[] = [];
    serve(author, base, calls);
    await render(<ViewBeacon postId="p" authorId="author" />);
    expect(calls).toEqual([]);
  });
});
