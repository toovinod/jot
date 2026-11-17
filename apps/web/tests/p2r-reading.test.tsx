import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  defaultAppearance,
  type Appearance,
  type Comment,
  type DocNode,
  type Engagement,
  type Post,
  type PostSummary,
  type Snapshot,
  type User,
} from "@jot/contracts";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, prefetch() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("not found");
  },
}));
mock.module("server-only", () => ({}));
// Public pages ask whether the request came in on a custom domain.
let requestHeaders = new Headers();
mock.module("next/headers", () => ({ headers: async () => requestHeaders }));

// DOM globals go in before the components load: Radix picks its layout effect at import time,
// and without a document its dialog would never mount. They are put back after this file.
const saved = new Map<string, PropertyDescriptor | undefined>();
const window = new Window({ url: "http://localhost/" });
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  localStorage: window.localStorage,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  // The confirm dialog traps focus and animates presence, which needs these DOM pieces.
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  NodeFilter: window.NodeFilter,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true });
}
afterAll(() => {
  for (const [name, descriptor] of saved)
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
});

const { Article, RichDocument } = await import("../src/components/document");
const { EngagementPanel } = await import("../src/components/engagement");
const { Providers } = await import("../src/components/providers");
const { PostCard } = await import("../src/components/post-card");

const harper: User = { id: "harper", username: "harper", name: "Harper", bio: "", avatar: "" };
const reader: User = { id: "reader", username: "sam", name: "Sam", bio: "", avatar: "" };
const text = (value: string): DocNode => ({ type: "text", text: value });
const paragraph = (value: string): DocNode => ({ type: "paragraph", content: [text(value)] });
const snapshot = (patch: Partial<Snapshot> = {}, look: Partial<Appearance> = {}): Snapshot => ({
  title: "the schema change that locked our biggest table",
  subtitle: "",
  slug: "the-schema-change",
  cover: "",
  content: { type: "doc", content: [paragraph("hello there")] },
  appearance: { ...defaultAppearance, ...look },
  visibility: "public",
  tags: [],
  ...patch,
});
const plain = (html: string) => html.replace(/<[^>]+>/g, "");

describe("reading page article", () => {
  test("each font and width sets its own type and column", () => {
    const families = { serif: "font-serif", sans: "font-sans", mono: "font-mono" } as const;
    for (const [font, family] of Object.entries(families)) {
      const html = renderToStaticMarkup(
        <Article snapshot={snapshot({}, { font: font as Appearance["font"] })} author={harper} />,
      );
      expect(html).toContain(family);
    }
    const widths = { narrow: "max-w-xl", standard: "max-w-2xl", wide: "max-w-4xl" } as const;
    for (const [width, column] of Object.entries(widths)) {
      const html = renderToStaticMarkup(
        <Article
          snapshot={snapshot({}, { width: width as Appearance["width"] })}
          author={harper}
        />,
      );
      expect(html).toContain(column);
    }
  });

  test("every accent sets the page's primary color, and themes map to wrapper classes", () => {
    const seen = new Set<string>();
    for (const accent of ["orange", "green", "blue", "violet", "rose"] as const) {
      const html = renderToStaticMarkup(
        <Article snapshot={snapshot({}, { accent })} author={harper} />,
      );
      const match = html.match(/\[--primary:(#[0-9a-f]{6})\]/);
      expect(match).not.toBeNull();
      seen.add(match![1]);
    }
    expect(seen.size).toBe(5);
    for (const [theme, className] of [
      ["dark", "dark"],
      ["light", "light"],
      ["system", "theme-system"],
    ] as const)
      expect(
        renderToStaticMarkup(<Article snapshot={snapshot({}, { theme })} author={harper} />),
      ).toContain(className);
  });

  test("byline shows the author, the date and a reading time; tags link to discover", () => {
    const words = Array.from({ length: 441 }, () => "word").join(" ");
    const html = renderToStaticMarkup(
      <Article
        snapshot={snapshot({
          tags: ["postgres"],
          content: { type: "doc", content: [paragraph(words)] },
        })}
        author={harper}
        publishedAt="2026-11-12T09:00:00Z"
      />,
    );
    expect(plain(html)).toContain("Harper");
    expect(html).toContain('dateTime="2026-11-12T09:00:00Z"');
    expect(plain(html)).toContain("3 min read");
    expect(html).toContain('href="/discover?tag=postgres"');
    expect(plain(html)).toContain("#postgres");
    expect(html).toContain('href="/@harper"');
    expect(plain(html)).toContain("more pages from Harper");
  });

  test("the cover loads first and an empty title reads as untitled", () => {
    const html = renderToStaticMarkup(
      <Article snapshot={snapshot({ title: "", cover: "/media/cover.png" })} author={harper} />,
    );
    expect(html).toContain('src="/media/cover.png"');
    expect(html).toMatch(/fetchPriority="high"|fetchpriority="high"/);
    expect(plain(html)).toContain("untitled");
  });

  test("checked tasks are struck through and blockquotes keep their text", () => {
    const html = renderToStaticMarkup(
      <RichDocument
        document={{
          type: "doc",
          content: [
            {
              type: "taskList",
              content: [
                { type: "taskItem", attrs: { checked: true }, content: [paragraph("shipped")] },
                { type: "taskItem", attrs: { checked: false }, content: [paragraph("next")] },
              ],
            },
            { type: "blockquote", content: [paragraph("lock_timeout saved us")] },
          ],
        }}
      />,
    );
    expect(html.match(/line-through/g)).toHaveLength(1);
    expect(html).toContain("<blockquote><p>lock_timeout saved us</p></blockquote>");
  });

  test("a deeply nested document still gets a reading time without overflowing the stack", () => {
    let node: DocNode = text("deep");
    for (let i = 0; i < 50_000; i++) node = { type: "blockquote", content: [node] };
    const html = renderToStaticMarkup(
      <Article
        snapshot={snapshot({ content: { type: "doc", content: [node] } })}
        author={harper}
      />,
    );
    expect(plain(html)).toContain("1 min read");
  });

  test("an 80,000 word post renders on the server quickly", () => {
    const sentence = "the lock queue grew while the migration waited for its turn. ";
    const content = Array.from({ length: 2000 }, (_, i) =>
      i % 50 === 0
        ? { type: "heading", attrs: { level: 2 }, content: [text(`part ${i}`)] }
        : paragraph(sentence.repeat(4)),
    );
    const started = performance.now();
    const html = renderToStaticMarkup(
      <Article snapshot={snapshot({ content: { type: "doc", content } })} author={harper} />,
    );
    expect(performance.now() - started).toBeLessThan(2000);
    expect(plain(html)).toContain("min read");
  });
});

test("post cards show the author, excerpt, tags, reading time and counts", () => {
  const post: PostSummary = {
    id: "p1",
    author: harper,
    title: "how we scaled postgres",
    subtitle: "",
    slug: "how-we-scaled-postgres",
    cover: "",
    visibility: "public",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    publishedAt: "2026-11-01T00:00:00Z",
    revision: 1,
    likes: 12,
    comments: 3,
    views: 0,
    tags: ["postgres"],
    excerpt: "a million reads a second, one boring step at a time.",
    readingMinutes: 9,
    isPublished: true,
  };
  const html = renderToStaticMarkup(<PostCard post={post} />);
  const words = plain(html);
  for (const part of ["Harper", "a million reads a second", "#postgres", "9 min read", "12", "3"])
    expect(words).toContain(part);
  expect(html).toContain('href="/@harper/how-we-scaled-postgres"');
  expect(html).not.toContain("font-serif");
});

test("on a custom domain, tag links on posts and cards go to the app origin", () => {
  const html = renderToStaticMarkup(
    <Article
      snapshot={snapshot({ tags: ["postgres"] })}
      author={harper}
      appOrigin="https://jot.example"
    />,
  );
  expect(html).toContain('href="https://jot.example/discover?tag=postgres"');
  // The author's own profile stays on the domain, where it is the home page.
  expect(html).toContain('href="/@harper"');
  const card = renderToStaticMarkup(
    <PostCard
      post={{ id: "p1", author: harper, slug: "settings", tags: ["go"] } as PostSummary}
      appOrigin="https://jot.example"
    />,
  );
  expect(card).toContain('href="https://jot.example/discover?tag=go"');
  expect(card).toContain('href="/@harper/settings"');
});

test("reading pages drop the old italic serif headings", () => {
  for (const file of [
    "components/engagement.tsx",
    "components/subscribe.tsx",
    "components/post-card.tsx",
    "app/discover/page.tsx",
    "app/[handle]/page.tsx",
    "app/[handle]/profile-posts.tsx",
  ]) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    expect(source).not.toContain("<em");
    expect(source).not.toContain("italic");
    expect(source).not.toContain("SkyScene");
  }
});

describe("pages", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  test("the share page labels a private draft and renders it with the article", async () => {
    globalThis.fetch = (async () =>
      Response.json({ ...snapshot({ title: "a draft in progress" }), author: harper })) as never;
    const { default: SharedDraftPage } = await import("../src/app/share/[token]/page");
    const html = renderToStaticMarkup(
      await SharedDraftPage({ params: Promise.resolve({ token: "abcdefghijklmnopqrstuvwxyz" }) }),
    );
    expect(html).toContain('role="note"');
    expect(plain(html)).toContain("private draft link, not published.");
    expect(plain(html)).toContain("a draft in progress");
  });
  test("the profile shows the author's name over the scene and no bio when it's empty", async () => {
    globalThis.fetch = (async () => Response.json({ author: harper, posts: [] })) as never;
    const { default: Profile } = await import("../src/app/[handle]/page");
    const html = renderToStaticMarkup(
      await Profile({ params: Promise.resolve({ handle: "@harper" }) }),
    );
    expect(plain(html)).toContain("Harper");
    expect(plain(html)).toContain("no pages yet.");
    expect(html).toContain('href="/@harper/rss.xml"');
    expect(html).toContain('href="#subscribe"');
    expect(html).not.toContain("on-sky mt-2.5");
  });
  test("on a custom domain the profile's app links point at the app origin", async () => {
    const env = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://jot.example";
    requestHeaders = new Headers({ "x-jot-custom-domain": "blog.harper.dev" });
    try {
      globalThis.fetch = (async () => Response.json({ author: harper, posts: [] })) as never;
      const { default: Profile } = await import("../src/app/[handle]/page");
      const html = renderToStaticMarkup(
        await Profile({ params: Promise.resolve({ handle: "@harper" }) }),
      );
      expect(html).toContain('href="https://jot.example/discover"');
      expect(html).toContain('href="https://jot.example/privacy"');
      expect(html).not.toContain('href="/discover"');
    } finally {
      requestHeaders = new Headers();
      if (env === undefined) delete process.env.APP_ORIGIN;
      else process.env.APP_ORIGIN = env;
    }
  });
});

describe("moderation", () => {
  let root: Root | null = null;
  const originalFetch = globalThis.fetch;
  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = null;
    globalThis.fetch = originalFetch;
  });
  const post = {
    ...snapshot(),
    id: "p",
    author: harper,
    revision: 1,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    likes: 0,
    comments: 4,
    views: 0,
  } as Post;
  const comment = (id: string, author: User, parentId?: string): Comment => ({
    id,
    body: `comment ${id}`,
    author,
    createdAt: "2026-11-02T00:00:00Z",
    ...(parentId ? { parentId } : {}),
  });
  const engagement: Engagement = {
    liked: false,
    bookmarked: false,
    likes: 0,
    commentsOff: false,
    comments: [
      comment("c1", reader),
      comment("c3", harper),
      comment("c2", harper, "c1"),
      comment("c4", reader, "c3"),
    ],
  };
  /** Serves the session and engagement; other requests are recorded and answered by `reply`. */
  function serve(
    user: User | null,
    calls: string[],
    reply = () => new Response(null, { status: 204 }),
  ) {
    globalThis.fetch = (async (url: string, options?: RequestInit) => {
      const method = options?.method || "GET";
      if (url === "/api/me")
        return user ? Response.json(user) : Response.json({ error: "no" }, { status: 401 });
      if (url === "/api/config")
        return Response.json({ aiEnabled: false, emailEnabled: false, domainTarget: "" });
      if (url.endsWith("/engagement")) return Response.json(engagement);
      calls.push(`${method} ${url} ${options?.body || ""}`.trim());
      return reply();
    }) as typeof fetch;
  }
  async function render(node: ReactNode) {
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    root = createRoot(container);
    await act(async () => root!.render(<Providers>{node}</Providers>));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    return container;
  }
  const buttons = () =>
    [...document.body.querySelectorAll("button")] as unknown as HTMLButtonElement[];
  async function type(selector: string, value: string) {
    const field = document.querySelector(selector)!;
    const key = Object.keys(field).find((k) => k.startsWith("__reactProps$"))!;
    const props = (field as unknown as Record<string, { onChange: (e: unknown) => void }>)[key];
    await act(async () => props.onChange({ target: { value } }));
  }

  test("the author blocks a reader after confirming, and that reader's comments disappear", async () => {
    const calls: string[] = [];
    serve(harper, calls);
    const container = await render(<EngagementPanel post={post} />);
    const blocks = buttons().filter((b) => b.getAttribute("aria-label")?.startsWith("Block "));
    // Only the reader's two comments offer a block; the author's own don't.
    expect(blocks.map((b) => b.getAttribute("aria-label"))).toEqual(["Block Sam", "Block Sam"]);
    await act(async () => blocks[0].click());
    expect(document.body.textContent).toContain("block Sam?");
    expect(calls).toEqual([]);
    const confirm = buttons().find((b) => b.textContent === "block reader")!;
    await act(async () => {
      confirm.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(calls).toEqual(['POST /api/me/blocked {"userId":"reader"}']);
    const shown = container.textContent!;
    expect(shown).not.toContain("comment c1");
    expect(shown).not.toContain("comment c2");
    expect(shown).not.toContain("comment c4");
    expect(shown).toContain("comment c3");
    expect(shown).toContain("Sam is blocked.");
  });

  test("readers who aren't the author see no block action", async () => {
    serve(reader, []);
    await render(<EngagementPanel post={post} />);
    expect(buttons().some((b) => b.getAttribute("aria-label")?.startsWith("Block "))).toBe(false);
  });

  test("a blocked reader who comments is told the author turned comments off for them", async () => {
    const calls: string[] = [];
    serve(reader, calls, () =>
      Response.json(
        { error: "The author has blocked you from commenting on their posts", code: "blocked" },
        { status: 403 },
      ),
    );
    const container = await render(<EngagementPanel post={post} />);
    await type("#comment", "hello");
    const submit = buttons().find((b) => b.textContent === "post comment")!;
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(calls).toEqual(['POST /api/posts/p/comments {"body":"hello"}']);
    expect(container.textContent).toContain("the author has turned off comments from you.");
    expect(container.querySelector("#comment")).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(buttons().some((b) => b.textContent === "reply")).toBe(false);
  });

  test("signed-out readers are asked to log in to comment", async () => {
    serve(null, []);
    const container = await render(<EngagementPanel post={post} />);
    expect(container.textContent).toContain("log in to leave a comment.");
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(container.querySelector("#comment")).toBeNull();
  });
});
