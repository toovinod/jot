import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { defaultAppearance, type Post, type RevisionSummary } from "@jot/contracts";
import { EditorProvider, useEditorController } from "../src/components/editor/editor-controller";
import { EditorToolbar } from "../src/components/editor/editor-toolbar";
import { PublicationHistory } from "../src/components/editor/publication-history";
import { RecoveryNotice } from "../src/components/editor/recovery-notice";
import { DraftRecovery } from "../src/lib/draft-recovery";
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
  revision: 2,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  likes: 0,
  comments: 0,
};
beforeAll(() => {
  const window = new Window({ url: "http://localhost/" });
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    sessionStorage: window.sessionStorage,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    confirm: () => true,
  }))
    Object.defineProperty(globalThis, name, { value, configurable: true });
});
afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
    root = null;
  }
  globalThis.fetch = originalFetch;
  sessionStorage.clear();
});
function Probe() {
  latest = useEditorController();
  return (
    <>
      <EditorToolbar />
      <RecoveryNotice />
      <PublicationHistory />
    </>
  );
}
async function mount() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  const router = {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  } as unknown as AppRouterInstance;
  await act(async () =>
    root!.render(
      <AppRouterContext.Provider value={router}>
        <EditorProvider initial={post}>
          <Probe />
        </EditorProvider>
      </AppRouterContext.Provider>,
    ),
  );
  return container;
}
describe("editor controller integration", () => {
  test("offers recovery without replacing the server draft and preserves optimistic conflicts on explicit recovery", async () => {
    new DraftRecovery(sessionStorage, "owner", "post").write(
      { ...post, title: "Local unsaved writing" },
      1,
    );
    let attemptedRevision: number | undefined;
    globalThis.fetch = (async (_url, options) => {
      attemptedRevision = JSON.parse(String(options?.body)).revision;
      return Response.json({ error: "A newer draft exists" }, { status: 409 });
    }) as typeof fetch;
    const container = await mount();
    expect(container.textContent).toContain("unsaved local draft");
    expect(latest.snapshot.title).toBe("Server draft");
    await act(async () => {
      latest.recoverLocalDraft();
      await Promise.resolve();
    });
    expect(attemptedRevision).toBe(1);
    expect(latest.snapshot.title).toBe("Local unsaved writing");
    expect(latest.saveState.conflict).toBe(true);
    expect(new DraftRecovery(sessionStorage, "owner", "post").read()?.snapshot.title).toBe(
      "Local unsaved writing",
    );
  });
  test("pending file work blocks publication immediately and final publication waits for autosave", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url, options) => {
      calls.push(`${options?.method} ${url}`);
      const body = JSON.parse(String(options?.body));
      return Response.json({
        ...post,
        ...(options?.method === "PUT" ? body : {}),
        revision: body.revision + 1,
      });
    }) as typeof fetch;
    await mount();
    let finish!: () => void;
    await act(async () => {
      finish = latest.beginPendingWork();
      await latest.publishDraft();
    });
    expect(calls).toEqual([]);
    await act(async () => {
      finish();
      latest.updateDraft({ title: "Latest writing" });
      await latest.publishDraft();
    });
    expect(calls).toEqual(["PUT /api/posts/post", "POST /api/posts/post/publish"]);
    expect(latest.saveState.dirty).toBe(false);
    expect(new DraftRecovery(sessionStorage, "owner", "post").read()).toBeNull();
  });
  test("renders lean revision summaries and restores by ID without downloading history documents", async () => {
    const summaries: RevisionSummary[] = [
      { id: 7, title: "A lean earlier edition", createdAt: "2026-01-01T00:00:00Z" },
    ];
    let restored: unknown;
    globalThis.fetch = (async (url, options) => {
      if (String(url).endsWith("/revisions")) return Response.json({ revisions: summaries });
      if (String(url).endsWith("/restore")) {
        restored = JSON.parse(String(options?.body));
        return Response.json({ ...post, title: "Restored edition", revision: 3 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;
    const container = await mount();
    await act(async () => {
      await latest.loadPublicationHistory();
    });
    expect(container.textContent).toContain("A lean earlier edition");
    expect(latest.revisions[0]).not.toHaveProperty("snapshot");
    await act(async () => {
      latest.restoreRevision(7);
      await Promise.resolve();
    });
    expect(restored).toEqual({ revision: 2, versionId: 7 });
    expect(latest.snapshot.title).toBe("Restored edition");
  });
  test("icon actions have stable accessible names independent of responsive text visibility", async () => {
    const container = await mount();
    for (const name of ["Customize", "Assist", "Preview", "Publication history"]) {
      expect(container.querySelector(`button[aria-label="${name}"]`)).not.toBeNull();
    }
  });
});
