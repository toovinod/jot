import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { defaultAppearance, type DocNode, type Post } from "@jot/contracts";
const window = new Window({ url: "http://localhost/" });
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  localStorage: window.localStorage,
  location: window.location,
  navigator: window.navigator,
  DOMParser: window.DOMParser,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  IS_REACT_ACT_ENVIRONMENT: true,
  confirm: () => true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Editor } = await import("@tiptap/react");
const { MarkdownManager } = await import("@tiptap/markdown");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { editorExtensions, markdownTitle, RichEditor } =
  await import("../src/components/editor/rich-editor");
const { isSupportedImage } = await import("../src/components/editor/image-import");
const { LinkPopover } = await import("../src/components/editor/link-popover");
const { EditorProvider, useEditorController } =
  await import("../src/components/editor/editor-controller");
const { PublicationPanel } = await import("../src/components/editor/publication-panel");
type Root = ReturnType<typeof createRoot>;
let root: Root | null = null;
let latest!: ReturnType<typeof useEditorController>;
const originalFetch = globalThis.fetch;
const post: Post = {
  id: "post",
  author: { id: "owner", username: "writer", name: "Writer", bio: "", avatar: "" },
  title: "Server draft",
  subtitle: "",
  slug: "story",
  cover: "",
  content: { type: "doc", content: [{ type: "paragraph" }] },
  appearance: defaultAppearance,
  visibility: "public",
  tags: [],
  revision: 2,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  likes: 0,
  comments: 0,
  views: 0,
};
afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
    root = null;
  }
  globalThis.fetch = originalFetch;
  localStorage.clear();
});
async function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}
// Other test files may load react-dom before any DOM exists, which turns off its input event
// support for the whole run. Calling the rendered handlers keeps these tests independent of that.
function handler(element: Element, name: string): ((event: unknown) => void) | undefined {
  const key = Object.keys(element).find((k) => k.startsWith("__reactProps$"));
  return key
    ? (element as unknown as Record<string, Record<string, (e: unknown) => void>>)[key][name]
    : undefined;
}
async function type(input: Element, value: string) {
  await act(async () => handler(input, "onChange")!({ target: { value } }));
}
/** Runs each onKeyDown from the target up, as the event would bubble. */
async function press(target: Element, key: string) {
  await act(async () => {
    for (let element: Element | null = target; element; element = element.parentElement)
      handler(element, "onKeyDown")?.({ key, preventDefault() {} });
  });
}
describe("editor writing tools", () => {
  test("markdown export uses the editor schema, keeping headings and code languages", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Setup" }] },
        {
          type: "codeBlock",
          attrs: { language: "sql" },
          content: [{ type: "text", text: "select 1;" }],
        },
      ],
    };
    const markdown = new MarkdownManager({ extensions: editorExtensions() }).serialize(doc);
    expect(markdown).toContain("### Setup");
    expect(markdown).toContain("```sql\nselect 1;\n```");
  });
  test("a Markdown file's leading H1 is offered as the title", () => {
    const manager = new MarkdownManager({ extensions: editorExtensions() });
    const titled = markdownTitle(manager.parse("# Slow  *mornings*\n\nFirst line.") as DocNode);
    expect(titled?.title).toBe("Slow mornings");
    expect(titled?.rest).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "First line." }] },
    ]);
    expect(markdownTitle(manager.parse("## Not a title\n\nBody") as DocNode)).toBeNull();
    expect(markdownTitle(manager.parse("Intro\n\n# Later") as DocNode)).toBeNull();
  });
  test("importing a Markdown file moves its H1 into an empty title, and keeps it otherwise", async () => {
    for (const accept of [true, false]) {
      let content: DocNode | null = null;
      const offered: string[] = [];
      const container = await render(
        <RichEditor
          document={{ type: "doc", content: [{ type: "paragraph" }] }}
          onChange={(doc) => (content = doc)}
          disabled={false}
          beginPendingWork={() => () => {}}
          isOperationBlocked={() => false}
          onImportTitle={(title) => {
            offered.push(title);
            return accept;
          }}
        />,
      );
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      const input = container.querySelector('input[accept^=".md"]')!;
      const file = new File(["# Slow mornings\n\nFirst line."], "post.md");
      await act(async () => handler(input, "onChange")!({ target: { files: [file], value: "" } }));
      expect(offered).toEqual(["Slow mornings"]);
      const types = (content as DocNode | null)?.content?.map((node) => node.type);
      expect(types?.includes("heading")).toBe(!accept);
      expect(JSON.stringify(content)).toContain("First line.");
      await act(async () => root!.unmount());
      root = null;
    }
  });
  test("markdown export writes the title as an H1 and the subtitle as the first line", async () => {
    await mountPanel();
    await act(async () => latest.updateDraft({ title: "Slow mornings", subtitle: "A short note" }));
    let written = "";
    const create = URL.createObjectURL;
    URL.createObjectURL = ((blob: Blob) => {
      void blob.text().then((text) => (written = text));
      return "blob:x";
    }) as typeof URL.createObjectURL;
    const click = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = () => {};
    try {
      await act(async () => {
        latest.downloadMarkdown();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    } finally {
      URL.createObjectURL = create;
      window.HTMLAnchorElement.prototype.click = click;
    }
    expect(written.startsWith("# Slow mornings\n\nA short note\n\n")).toBe(true);
  });
  test("WebP images can be uploaded", () => {
    expect(isSupportedImage(new File(["x"], "a.webp", { type: "image/webp" }))).toBe(true);
    expect(isSupportedImage(new File(["x"], "a.svg", { type: "image/svg+xml" }))).toBe(false);
  });
  test("the link popover validates, applies on Enter, and cancels on Escape", async () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: editorExtensions(),
      injectCSS: false,
      content: "<p>read this</p>",
    });
    try {
      editor.commands.setTextSelection({ from: 1, to: 10 });
      let closed = 0;
      const container = await render(<LinkPopover editor={editor} onClose={() => closed++} />);
      const input = container.querySelector("#link-url")!;
      expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(
        "Edit link",
      );
      await type(input, "javascript:alert(1)");
      await press(input, "Enter");
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("http");
      expect(closed).toBe(0);
      await type(input, "https://example.org");
      await press(input, "Enter");
      expect(closed).toBe(1);
      expect(editor.getAttributes("link").href).toBe("https://example.org");
      await press(input, "Escape");
      expect(closed).toBe(2);
    } finally {
      editor.destroy();
    }
  });
  test("the link popover removes an existing link", async () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: editorExtensions(),
      injectCSS: false,
      content: '<p><a href="https://example.org">read this</a></p>',
    });
    try {
      editor.commands.setTextSelection(3);
      const container = await render(<LinkPopover editor={editor} onClose={() => {}} />);
      const remove = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "remove link",
      )!;
      await act(async () => (remove as unknown as HTMLButtonElement).click());
      expect(JSON.stringify(editor.getJSON())).not.toContain("link");
    } finally {
      editor.destroy();
    }
  });
});
function Probe() {
  latest = useEditorController();
  return <PublicationPanel />;
}
async function mountPanel() {
  const router = { push() {}, replace() {}, prefetch() {} } as never;
  const container = await render(
    <AppRouterContext.Provider value={router}>
      <EditorProvider initial={post}>
        <Probe />
      </EditorProvider>
    </AppRouterContext.Provider>,
  );
  await act(async () => latest.setPanel("publish"));
  return container;
}
describe("publish panel", () => {
  test("normalizes tags, rejects invalid ones, and caps them at five", async () => {
    globalThis.fetch = (async (_url, options) =>
      Response.json({
        ...post,
        ...JSON.parse(String(options?.body)),
        revision: 3,
      })) as typeof fetch;
    const container = await mountPanel();
    const input = container.querySelector("#post-tags")!;
    await type(input, "Postgres Tips");
    await press(input, "Enter");
    expect(latest.snapshot.tags).toEqual(["postgres-tips"]);
    await type(input, "bad_tag!");
    await press(input, "Enter");
    expect(latest.snapshot.tags).toEqual(["postgres-tips"]);
    expect(container.textContent).toContain("lowercase letters, numbers or hyphens");
    for (const tag of ["a", "b", "c", "d"]) {
      await type(input, tag);
      await press(input, "Enter");
    }
    expect(latest.snapshot.tags).toHaveLength(5);
    expect((input as unknown as HTMLInputElement).disabled).toBe(true);
  });
  test("comments toggle is part of the saved draft", async () => {
    let saved: Record<string, unknown> = {};
    globalThis.fetch = (async (_url, options) => {
      saved = JSON.parse(String(options?.body));
      return Response.json({ ...post, ...saved, revision: 3 });
    }) as typeof fetch;
    const container = await mountPanel();
    const toggle = [...container.querySelectorAll('button[role="switch"]')].find((button) =>
      button.textContent?.includes("allow comments"),
    ) as unknown as HTMLButtonElement;
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await act(async () => toggle.click());
    expect(latest.snapshot.commentsOff).toBe(true);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await act(async () => latest.saveDraft());
    expect(saved.commentsOff).toBe(true);
    expect(saved.tags).toEqual([]);
  });
  test("a refused scheduled publish shows its reason", async () => {
    const container = await render(
      <AppRouterContext.Provider value={{ push() {}, replace() {}, prefetch() {} } as never}>
        <EditorProvider initial={{ ...post, scheduleError: "the slug is taken" } as Post}>
          <Probe />
        </EditorProvider>
      </AppRouterContext.Provider>,
    );
    await act(async () => latest.setPanel("publish"));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "the scheduled publish didn't go out: the slug is taken",
    );
  });
  test("schedules and cancels through the API, and creates and revokes a private link", async () => {
    const calls: string[] = [];
    let current: Post = post;
    globalThis.fetch = (async (url, options) => {
      const method = options?.method || "GET";
      calls.push(`${method} ${url}`);
      const path = String(url);
      if (path.endsWith("/schedule")) {
        if (method === "POST") {
          const body = JSON.parse(String(options?.body));
          expect(body).toMatchObject({ revision: 2, emailSubscribers: false });
          current = { ...current, scheduledAt: body.at };
        } else current = { ...current, scheduledAt: undefined };
        return new Response(null, { status: 204 });
      }
      if (path.endsWith("/share")) {
        if (method === "POST") return Response.json({ token: "abcdefghijklmnopqrstuvwxyz" });
        return new Response(null, { status: 204 });
      }
      return Response.json(current);
    }) as typeof fetch;
    const container = await mountPanel();
    const at = new Date(Date.now() + 86400000).toISOString();
    await act(async () => latest.schedulePublish(at));
    expect(calls).toEqual(["POST /api/posts/post/schedule", "GET /api/posts/post"]);
    expect(latest.post.scheduledAt).toBe(at);
    expect(container.textContent).toContain("cancel schedule");
    await act(async () => latest.cancelSchedule());
    expect(latest.post.scheduledAt).toBeUndefined();
    await act(async () => latest.createShareLink());
    const link = container.querySelector(
      'input[aria-label="Private draft link"]',
    ) as unknown as HTMLInputElement | null;
    expect(link?.value).toBe("http://localhost/share/abcdefghijklmnopqrstuvwxyz");
    await act(async () => {
      latest.revokeShareLink();
      await Promise.resolve();
    });
    expect(calls).toContain("DELETE /api/posts/post/share");
    expect(latest.post.shareToken).toBeUndefined();
  });
});
