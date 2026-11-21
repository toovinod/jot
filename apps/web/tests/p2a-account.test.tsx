import { afterEach, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { mockNavigation } from "./mock-navigation";

mockNavigation({
  usePathname: () => "/settings",
});

const originalFetch = globalThis.fetch;
let root: Root | null = null;
let requests: string[] = [];
beforeAll(() => {
  const window = new Window({ url: "http://localhost/settings" });
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
  requests = [];
  history.replaceState(null, "", "/settings");
});
async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll("button")].find((el) => el.textContent?.includes(text));
function respond(handler: (method: string, url: string) => Response | Promise<Response>) {
  globalThis.fetch = (async (url: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    requests.push(`${method} ${url}`);
    return handler(method, url);
  }) as typeof fetch;
}
const harper = { id: "h", username: "harper", name: "Harper", bio: "", avatar: "" };
const reader = (id: string, name: string) => ({
  user: { id, username: name.toLowerCase(), name, bio: "", avatar: "" },
  blockedAt: "2026-11-02T10:00:00Z",
});

test("blocked readers can be unblocked one at a time", async () => {
  let finish!: () => void;
  respond(async (method) => {
    if (method === "DELETE") {
      await new Promise<void>((resolve) => (finish = resolve));
      return Response.json({ ok: true });
    }
    return Response.json([reader("r1", "Quinn"), reader("r2", "Rowan")]);
  });
  const { BlockedReaders } = await import("../src/app/settings/account-sections");
  const container = await mount(<BlockedReaders />);
  await settle();
  expect(container.textContent).toContain("@quinn");
  const unblock = container.querySelector(
    'button[aria-label="Unblock Quinn"]',
  ) as HTMLButtonElement;
  await act(async () => unblock.click());
  expect(unblock.disabled).toBe(true);
  expect(unblock.textContent).toBe("unblocking…");
  expect(
    (container.querySelector('button[aria-label="Unblock Rowan"]') as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(requests).toEqual(["GET /api/me/blocked", "DELETE /api/me/blocked/r1"]);
  await act(async () => finish());
  expect(container.textContent).not.toContain("@quinn");
  expect(container.textContent).toContain("@rowan");
});

test("no blocked readers shows a critter, and a failed unblock says why", async () => {
  respond(() => Response.json([]));
  const { BlockedReaders } = await import("../src/app/settings/account-sections");
  let container = await mount(<BlockedReaders />);
  await settle();
  expect(container.textContent).toContain("nobody is blocked.");
  expect(container.querySelector("svg")).not.toBeNull();

  respond((method) =>
    method === "DELETE"
      ? Response.json({ error: "Something went wrong. Please try again." }, { status: 500 })
      : Response.json([reader("r1", "Quinn")]),
  );
  container = await mount(<BlockedReaders />);
  await settle();
  await act(async () =>
    (container.querySelector('button[aria-label="Unblock Quinn"]') as HTMLButtonElement).click(),
  );
  // A server failure reads as a plain sentence, not the raw response.
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "the server had a problem. try again in a moment.",
  );
  expect(container.textContent).toContain("@quinn");
});

function settingsApi(domainTarget: string) {
  respond((_method, url) => {
    if (url.endsWith("/me")) return Response.json(harper);
    if (url.endsWith("/config"))
      return Response.json({ aiEnabled: false, emailEnabled: true, domainTarget });
    if (url.includes("/me/subscribers")) return Response.json({ total: 0, items: [] });
    if (url.endsWith("/me/blocked")) return Response.json([]);
    if (url.endsWith("/me/domain")) return Response.json(null);
    return Response.json({});
  });
}

test("settings shows every section, and custom domains only when the server offers them", async () => {
  const { Providers } = await import("../src/components/providers");
  const { default: Settings } = await import("../src/app/settings/page");
  settingsApi("");
  let container = await mount(
    <Providers>
      <Settings />
    </Providers>,
  );
  await settle();
  const headings = () => [...container.querySelectorAll("h2")].map((h) => h.textContent);
  expect(headings()).toEqual([
    "profile",
    "email",
    "subscribers",
    "no subscribers yet.",
    "blocked readers",
    "nobody is blocked.",
    "export everything",
    "delete account",
  ]);
  expect(container.querySelector("h1")?.textContent).toBe("settings.");
  expect((container.querySelector('input[value="@harper"]') as HTMLInputElement).disabled).toBe(
    true,
  );
  expect(requests).not.toContain("GET /api/me/domain");

  await act(async () => root!.unmount());
  settingsApi("pages.example.com");
  root = null;
  container = await mount(
    <Providers>
      <Settings />
    </Providers>,
  );
  await settle();
  expect(headings()).toContain("custom domain");
  expect(requests).toContain("GET /api/me/domain");
  expect(button(container, "add domain")).toBeDefined();
});

test("a pending custom domain lists its TXT and CNAME records", async () => {
  respond(() =>
    Response.json({
      domain: "pages.example.com",
      verified: false,
      txtName: "_jot.pages.example.com",
      txtValue: "jot-verify=abc",
      target: "",
    }),
  );
  const { CustomDomainSection } = await import("../src/app/settings/account-sections");
  const container = await mount(<CustomDomainSection target="jot.example" />);
  await settle();
  expect(container.textContent).toContain("waiting for dns");
  expect(container.textContent).toContain("_jot.pages.example.com");
  expect(container.textContent).toContain("jot-verify=abc");
  expect(container.textContent).toContain("jot.example");
  expect(container.querySelector('button[aria-label="Copy TXT value"]')).not.toBeNull();
  expect(button(container, "check dns")).toBeDefined();
  expect(button(container, "remove domain")).toBeDefined();
});

test("signup shows the password rules as they are met", async () => {
  const { AuthForm, PasswordRules } = await import("../src/components/auth-form");
  const rules = async (password: string) =>
    [...(await mount(<PasswordRules password={password} />)).querySelectorAll("li")].map(
      (li) => li.className.match(/text-(grass-3|destructive|muted-foreground)/)![1],
    );
  expect(await rules("")).toEqual(["muted-foreground", "muted-foreground"]);
  expect(await rules("short")).toEqual(["muted-foreground", "grass-3"]);
  expect(await rules("long enough")).toEqual(["grass-3", "grass-3"]);
  expect(await rules("é".repeat(37))).toEqual(["grass-3", "destructive"]);

  const container = await mount(<AuthForm signup />);
  expect(container.querySelector('[aria-label="Password rules"]')).not.toBeNull();
  expect((await mount(<AuthForm />)).querySelector('[aria-label="Password rules"]')).toBeNull();
  for (const href of ["/login", "/terms", "/privacy"])
    expect(renderToStaticMarkup(<AuthForm signup />)).toContain(`href="${href}"`);
});

test("auth pages paint the pixel sky with Harper's address and no italic serif", async () => {
  const { AuthForm } = await import("../src/components/auth-form");
  const html = renderToStaticMarkup(<AuthForm />);
  expect(html).toContain('shape-rendering="crispEdges"');
  expect(html).toContain("/@harper/first-page");
  expect(html).not.toContain("/@you");
  expect(html).not.toContain("<em");
  expect(html).not.toContain("font-serif");
  expect(html).toContain('href="/auth/forgot"');
  expect(html).toContain('href="/signup"');
});

test("a reset link without its token points to a new one", async () => {
  history.replaceState(null, "", "/auth/reset");
  respond(() => Response.json({ ok: true }));
  const { AccountAction } = await import("../src/components/account-action");
  const container = await mount(<AccountAction mode="reset" />);
  expect(container.querySelector('[aria-label="Password rules"]')).not.toBeNull();
  expect(container.querySelector('a[href="/auth/forgot"]')).toBeNull();
  // A plain submit event skips happy-dom's required-field check on the empty password.
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }) as never);
  });
  expect(requests).toEqual([]);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("missing its token");
  expect(container.querySelector('a[href="/auth/forgot"]')?.textContent).toBe("send a new link");
});

test("a signed-in writer on an expired verify link sends a new one", async () => {
  history.replaceState(null, "", "/auth/verify?token=old");
  respond((_method, url) => {
    if (url.endsWith("/me")) return Response.json(harper);
    if (url.endsWith("/config"))
      return Response.json({ aiEnabled: false, emailEnabled: true, domainTarget: "" });
    if (url.endsWith("/verification/confirm"))
      return Response.json({ error: "expired", code: "invalid_token" }, { status: 400 });
    return Response.json({ ok: true });
  });
  const { Providers } = await import("../src/components/providers");
  const { default: Verify } = await import("../src/app/auth/verify/page");
  const container = await mount(
    <Providers>
      <Verify />
    </Providers>,
  );
  await settle();
  await act(async () => button(container, "verify email")!.click());
  await settle();
  await act(async () => button(container, "send a new link")!.click());
  await settle();
  expect(requests).toContain("POST /api/auth/verification/request");
  expect(container.textContent).toContain("a new link is on its way.");
  expect(button(container, "send a new link")).toBeUndefined();
});

test("unsubscribing names the writer when the API does, and this writer otherwise", async () => {
  const { SubscriptionAction } = await import("../src/components/subscription-action");
  history.replaceState(null, "", "/subscriptions/unsubscribe?token=t");
  respond(() => Response.json({ ok: true }));
  let container = await mount(<SubscriptionAction unsubscribe />);
  await act(async () => button(container, "unsubscribe")!.click());
  expect(requests).toEqual(["POST /api/subscriptions/unsubscribe"]);
  expect(container.textContent).toContain("no more emails from this writer.");

  respond(() => Response.json({ ok: true, author: "Harper" }));
  container = await mount(<SubscriptionAction unsubscribe />);
  await act(async () => button(container, "unsubscribe")!.click());
  expect(container.textContent).toContain("no more emails from Harper.");
});

test("subscription links fail clearly, with a retry only when one could help", async () => {
  const { SubscriptionAction } = await import("../src/components/subscription-action");
  history.replaceState(null, "", "/subscriptions/confirm");
  respond(() => Response.json({ ok: true }));
  let container = await mount(<SubscriptionAction />);
  await act(async () => button(container, "confirm subscription")!.click());
  expect(requests).toEqual([]);
  expect(container.textContent).toContain("that link didn't work.");
  expect(container.textContent).toContain("missing its token");
  expect(button(container, "try again")).toBeUndefined();

  history.replaceState(null, "", "/subscriptions/confirm?token=t");
  respond(() =>
    Response.json(
      { error: "Invalid or expired confirmation link", code: "invalid_token" },
      { status: 400 },
    ),
  );
  container = await mount(<SubscriptionAction />);
  await act(async () => button(container, "confirm subscription")!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "invalid or expired confirmation link",
  );
  expect(button(container, "try again")).toBeDefined();
  expect(container.querySelector('a[href="/discover"]')).not.toBeNull();
});

test("legal pages carry a contents list and this round's facts", async () => {
  const { default: Privacy } = await import("../src/app/privacy/page");
  const { default: Terms } = await import("../src/app/terms/page");
  for (const Page of [Privacy, Terms]) {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain("last updated November 18, 2026");
    const links = [...html.matchAll(/href="#([a-z-]+)"/g)].map((m) => m[1]);
    const ids = [...html.matchAll(/<section id="([a-z-]+)"/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(4);
    expect(links).toEqual(ids);
    expect(html).not.toContain(String.fromCharCode(0x2014));
  }
  const privacy = renderToStaticMarkup(<Privacy />).replace(/\s+/g, " ");
  for (const fact of [
    "HMAC-SHA256",
    "raw addresses are not stored",
    "the full page goes to your inbox",
    "looks up its DNS records",
    "block a reader from commenting",
    "zip of Markdown files",
    "deletes your uploaded files",
  ])
    expect(privacy).toContain(fact);
  expect(privacy).not.toContain("contact whoever runs this copy of jot");
  const source = readFileSync(new URL("../src/components/legal.tsx", import.meta.url), "utf8");
  expect(source).toContain("SceneHeader");
});

test("account deletion names the account on screen, so a session switched in another tab is refused", async () => {
  const sent: Headers[] = [];
  globalThis.fetch = (async (_url: string, options?: RequestInit) => {
    sent.push(new Headers(options?.headers));
    return Response.json(
      {
        error: "Your signed-in account changed. Reload before deleting.",
        code: "identity_changed",
      },
      { status: 409 },
    );
  }) as typeof fetch;
  const { DeleteAccount } = await import("../src/app/settings/account-sections");
  const container = await mount(<DeleteAccount userId="h" />);
  const input = container.querySelector('input[type="password"]') as HTMLInputElement;
  const key = Object.keys(input).find((k) => k.startsWith("__reactProps$"))!;
  const props = (input as unknown as Record<string, { onChange: (e: unknown) => void }>)[key];
  await act(async () => props.onChange({ target: { value: "secret" } }));
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }) as never);
  });
  await settle();
  expect(sent).toHaveLength(1);
  expect(sent[0].get("X-Jot-User-ID")).toBe("h");
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

const subscriber = (i: number) => ({
  id: `s${i}`,
  email: `s${i}@example.com`,
  createdAt: "2026-11-01T10:00:00Z",
});
const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => subscriber(from + i));

test("subscriber pages follow the server offset, stop on a short page, and refresh", async () => {
  respond((_method, url) => {
    const offset = Number(new URL(url, "http://x").searchParams.get("offset"));
    // Someone subscribed between pages, so page two repeats the last row of page one.
    if (offset === 0) return Response.json({ total: 120, items: range(0, 50) });
    if (offset === 50) return Response.json({ total: 121, items: range(49, 99) });
    if (offset === 100) return Response.json({ total: 121, items: range(99, 111) });
    return Response.json({ total: 121, items: [] });
  });
  const { Subscribers } = await import("../src/app/settings/account-sections");
  const container = await mount(<Subscribers />);
  await settle();
  await act(async () => button(container, "show more")!.click());
  await settle();
  await act(async () => button(container, "show more")!.click());
  await settle();
  const offsets = () =>
    requests.map((r) => Number(new URL(r.split(" ")[1], "http://x").searchParams.get("offset")));
  expect(offsets()).toEqual([0, 50, 100]);
  expect(container.querySelectorAll("li")).toHaveLength(111);
  // A short page is the end, whatever the total says.
  expect(button(container, "show more")).toBeUndefined();
  await act(async () => button(container, "refresh")!.click());
  await settle();
  expect(offsets()).toEqual([0, 50, 100, 0]);
  expect(container.querySelectorAll("li")).toHaveLength(50);
});

test("a removal steps the next offset back so nobody is skipped", async () => {
  respond((method, url) => {
    if (method === "DELETE") return Response.json({ ok: true });
    const offset = Number(new URL(url, "http://x").searchParams.get("offset"));
    return Response.json({ total: 120, items: range(offset, offset + 50) });
  });
  const { Subscribers } = await import("../src/app/settings/account-sections");
  const container = await mount(<Subscribers />);
  await settle();
  await act(async () =>
    (
      container.querySelector('button[aria-label="Remove s3@example.com"]') as HTMLButtonElement
    ).click(),
  );
  await settle();
  await act(async () => button(container, "show more")!.click());
  await settle();
  expect(requests.at(-1)).toBe("GET /api/me/subscribers?offset=49&limit=50");
});

test("subscribers, blocked readers and the custom domain offer a retry when loading fails", async () => {
  const sections = await import("../src/app/settings/account-sections");
  const cases = [
    {
      node: <sections.Subscribers />,
      ok: () => Response.json({ total: 0, items: [] }),
      text: "no subscribers yet.",
    },
    { node: <sections.BlockedReaders />, ok: () => Response.json([]), text: "nobody is blocked." },
    {
      node: <sections.CustomDomainSection target="jot.example" />,
      ok: () => Response.json(null),
      text: "add domain",
    },
  ];
  for (const { node, ok, text } of cases) {
    let fail = true;
    respond(() =>
      fail
        ? Response.json({ error: "Something went wrong. Please try again." }, { status: 500 })
        : ok(),
    );
    const container = await mount(node);
    await settle();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain(text);
    fail = false;
    await act(async () => button(container, "try again")!.click());
    await settle();
    expect(container.textContent).toContain(text);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(button(container, "try again")).toBeUndefined();
    await act(async () => root!.unmount());
    root = null;
  }
});
