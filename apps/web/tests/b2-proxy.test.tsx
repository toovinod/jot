import { afterEach, beforeEach, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

const originalFetch = globalThis.fetch;
let lookups: string[] = [];
beforeEach(() => {
  process.env.APP_ORIGIN = "https://jot.example";
  lookups = [];
  globalThis.fetch = (async (url: string) => {
    const host = new URL(url).searchParams.get("host")!;
    lookups.push(host);
    if (host === "blog.maya.dev") return Response.json({ username: "maya" });
    if (host === "down.example") throw new Error("offline");
    return Response.json({ error: "Not found" }, { status: 404 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const request = (host: string, path: string) =>
  new NextRequest(`http://${host}${path}`, { headers: { host } });
const rewrite = (response: Response | undefined) =>
  response?.headers.get("x-middleware-rewrite") ?? null;

test("a verified domain serves the author's profile and posts", async () => {
  expect(rewrite(await proxy(request("blog.maya.dev", "/")))).toBe("http://blog.maya.dev/@maya");
  expect(rewrite(await proxy(request("blog.maya.dev", "/first-post")))).toBe(
    "http://blog.maya.dev/@maya/first-post",
  );
  expect(lookups).toEqual(["blog.maya.dev"]);
});

test("the app host and other paths pass through", async () => {
  expect(await proxy(request("jot.example", "/discover"))).toBeUndefined();
  expect(await proxy(request("jot.example", "/@maya/first-post"))).toBeUndefined();
  expect(await proxy(request("blog.maya.dev", "/a/b/c"))).toBeUndefined();
  expect(lookups).toEqual([]);
});

const location = (response: Response | undefined) => response?.headers.get("location") ?? null;

test("app routes on a custom domain go to the app origin", async () => {
  for (const path of ["/login", "/signup", "/dashboard", "/editor/p1", "/settings", "/discover"])
    expect(location(await proxy(request("blog.maya.dev", path)))).toBe(
      `https://jot.example${path}`,
    );
  expect(location(await proxy(request("blog.maya.dev", "/discover?tag=go")))).toBe(
    "https://jot.example/discover?tag=go",
  );
  // An unknown host keeps the app's own pages rather than bouncing them.
  expect(await proxy(request("other.example", "/login"))).toBeUndefined();
});

test("a custom domain serves only its own author", async () => {
  expect(location(await proxy(request("blog.maya.dev", "/@maya")))).toBe("http://blog.maya.dev/");
  expect(location(await proxy(request("blog.maya.dev", "/@maya/first-post")))).toBe(
    "http://blog.maya.dev/first-post",
  );
  for (const path of ["/@sam", "/@sam/their-post", "/%40sam/their-post", "/@maya/a/b"])
    expect((await proxy(request("blog.maya.dev", path)))?.status).toBe(404);
});

test("the rewrite marks the request as a custom domain one", async () => {
  const response = await proxy(request("blog.maya.dev", "/first-post"));
  expect(response?.headers.get("x-middleware-request-x-jot-custom-domain")).toBe("blog.maya.dev");
});

test("implausible hosts are never looked up", async () => {
  for (const host of ["localhost", "10.0.0.1", "bad_host.example", "-x.example", "a..example"])
    expect(await proxy(request(host, "/"))).toBeUndefined();
  expect(lookups).toEqual([]);
});

test("a flood of unknown hosts doesn't evict a verified domain", async () => {
  await proxy(request("blog.maya.dev", "/"));
  for (let i = 0; i < 1100; i++) await proxy(request(`junk${i}.example`, "/"));
  lookups = [];
  expect(rewrite(await proxy(request("blog.maya.dev", "/")))).toBe("http://blog.maya.dev/@maya");
  expect(lookups).toEqual([]);
  // The oldest misses were dropped to stay under the cap, so they are looked up again.
  await proxy(request("junk0.example", "/"));
  expect(lookups).toEqual(["junk0.example"]);
});

test("unknown domains and a failing resolver are a no-op", async () => {
  expect(await proxy(request("other.example", "/"))).toBeUndefined();
  expect(await proxy(request("down.example", "/"))).toBeUndefined();
});

test("a post whose slug matches an app route stays a post at its author-qualified path", async () => {
  for (const path of ["/@maya/settings", "/%40maya/settings", "/@maya/discover"]) {
    const response = await proxy(request("blog.maya.dev", path));
    expect(location(response)).toBeNull();
    expect(rewrite(response)).toBe(`http://blog.maya.dev/@maya${path.slice(path.indexOf("/", 1))}`);
    expect(response?.headers.get("x-middleware-request-x-jot-custom-domain")).toBe("blog.maya.dev");
  }
  // The bare path is still the app's page.
  expect(location(await proxy(request("blog.maya.dev", "/settings")))).toBe(
    "https://jot.example/settings",
  );
});
