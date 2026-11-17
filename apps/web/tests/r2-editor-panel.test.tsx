import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { defaultAppearance, type Post } from "@jot/contracts";

// DOM globals go in before the components load: Radix picks its layout effect at import time,
// and its dialog dispatches DOM events. They are put back after this file.
const saved = new Map<string, PropertyDescriptor | undefined>();
const window = new Window({ url: "http://localhost/editor/post", width: 390, height: 800 });
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  location: window.location,
  navigator: window.navigator,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
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

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { EditorProvider, useEditorController } =
  await import("../src/components/editor/editor-controller");
const { EditorSidebar } = await import("../src/components/editor/editor-sidebar");

const post: Post = {
  id: "post",
  author: { id: "owner", username: "harper", name: "Harper", bio: "", avatar: "" },
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
let root: ReturnType<typeof createRoot> | null = null;
let latest!: ReturnType<typeof useEditorController>;
const originalFetch = globalThis.fetch;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  globalThis.fetch = originalFetch;
});
const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
function Probe({ children }: { children?: React.ReactNode }) {
  latest = useEditorController();
  return <>{children}</>;
}
async function mountController(initial: Post, children?: React.ReactNode) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  const router = { push() {}, replace() {}, prefetch() {} } as never;
  await act(async () =>
    root!.render(
      <AppRouterContext.Provider value={router}>
        <EditorProvider initial={initial}>
          <Probe>{children}</Probe>
        </EditorProvider>
      </AppRouterContext.Provider>,
    ),
  );
  return container;
}

test("on small screens the panel is a dialog: focus moves in, Escape closes it from anywhere, and focus returns", async () => {
  globalThis.fetch = (async () => Response.json({ revisions: [] })) as unknown as typeof fetch;
  const container = await mountController(
    post,
    <>
      <button id="opener" type="button">
        open
      </button>
      <EditorSidebar />
    </>,
  );
  const opener = container.querySelector("#opener") as unknown as HTMLButtonElement;
  opener.focus();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => latest.showPanel("ai"));
  await wait(0);
  const dialog = () => document.querySelector('[role="dialog"]');
  expect(dialog()).not.toBeNull();
  expect(dialog()!.id).toBe("editor-panel");
  expect(document.getElementById(dialog()!.getAttribute("aria-labelledby")!)?.textContent).toBe(
    "Page settings",
  );
  expect(dialog()!.contains(document.activeElement)).toBe(true);
  const assist = dialog()!.querySelector('section[aria-label="Assist"]');
  expect(assist).not.toBeNull();
  // Escape works wherever the key lands, not only inside the panel.
  await act(async () => {
    document.body.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as never,
    );
  });
  await wait(0);
  expect(latest.panel).toBeNull();
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(opener as unknown as Element);
  // Assist was not remounted while the sheet was closed, so a running request carries on.
  await act(async () => latest.showPanel("ai"));
  await wait(0);
  expect(dialog()!.querySelector('section[aria-label="Assist"]')).toBe(assist);
});
