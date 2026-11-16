import assert from "node:assert/strict";
import {
  defaultAppearance,
  type Post,
  type PostSummary,
  type User,
} from "../../packages/contracts/src";

// Run only against an isolated database: this exercises real persistence and auth.
const base = (process.env.JOT_SMOKE_URL || "http://localhost:3000").replace(/\/$/, "");
const origin = process.env.APP_ORIGIN || new URL(base).origin;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const actors = { author: { cookie: "" }, reader: { cookie: "" }, anonymous: { cookie: "" } };
type Actor = keyof typeof actors;
async function request<T = any>(
  actor: Actor,
  path: string,
  method = "GET",
  body?: unknown,
  expected = 200,
  headers: Record<string, string> = {},
): Promise<{ data: T; response: Response }> {
  const response = await fetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(actors[actor].cookie ? { Cookie: actors[actor].cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  assert.equal(
    response.status,
    expected,
    `${actor} ${method} ${path}: ${response.status} ${raw.slice(0, 400)}`,
  );
  if (response.headers.get("set-cookie"))
    actors[actor].cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  const data = raw ? (JSON.parse(raw) as T) : (undefined as T);
  if (expected >= 400)
    assert.equal(typeof (data as any)?.error, "string", `JSON error contract for ${path}`);
  return { data, response };
}
async function upload(
  actor: Actor,
  data: Uint8Array,
  filename: string,
  type: string,
  expectedStatus: number,
) {
  const form = new FormData();
  form.set("file", new File([data], filename, { type }));
  const response = await fetch(`${base}/api/uploads`, {
    method: "POST",
    headers: { Origin: origin, ...(actors[actor].cookie ? { Cookie: actors[actor].cookie } : {}) },
    body: form,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    expectedStatus,
    `Multipart upload: ${response.status} ${JSON.stringify(result)}`,
  );
  if (expectedStatus >= 400) assert.equal(typeof result.error, "string");
  return result as { url: string };
}
async function page(
  path: string,
  expectedStatus: number,
  present: string[] = [],
  absent: string[] = [],
) {
  const response = await fetch(`${base}${path}`, {
    headers: { Accept: "text/html", "Cache-Control": "no-cache" },
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  const html = await response.text();
  assert.equal(response.status, expectedStatus, `Public HTML ${path}: ${response.status}`);
  assert.ok(response.headers.get("content-type")?.includes("text/html"), `${path} serves HTML`);
  for (const text of present) assert.ok(html.includes(text), `${path} renders ${text}`);
  for (const text of absent) assert.ok(!html.includes(text), `${path} excludes ${text}`);
}
function userContract(user: User) {
  assert.deepEqual(Object.keys(user).sort(), ["avatar", "bio", "id", "name", "username"]);
  assert.match(user.id, /^[0-9a-f-]{36}$/i);
}
function postContract(post: Post) {
  userContract(post.author);
  assert.equal(typeof post.revision, "number");
  assert.equal(typeof post.likes, "number");
  assert.equal(typeof post.comments, "number");
  assert.equal(post.content.type, "doc");
  assert.ok(Number.isFinite(Date.parse(post.createdAt)));
  assert.ok(Number.isFinite(Date.parse(post.updatedAt)));
}
const credentials = (actor: string) => ({
  email: `smoke-${actor}-${suffix}@example.com`,
  password: `Jot-smoke-${suffix}!`,
  username: `s${actor}${suffix}`,
  name: `Smoke ${actor}`,
});
const authorInput = credentials("author"),
  readerInput = credentials("reader");
let postId = "",
  commentId = "";
try {
  await request("anonymous", "/api/health");
  const { data: config } = await request("anonymous", "/api/config");
  assert.equal(typeof config.aiEnabled, "boolean");
  assert.equal(typeof config.emailEnabled, "boolean");
  await request("anonymous", "/api/me", "GET", undefined, 401);
  for (const [actor, input] of [
    ["author", authorInput],
    ["reader", readerInput],
  ] as const) {
    const result = await request<User>(actor, "/api/auth/signup", "POST", input, 201);
    userContract(result.data);
    assert.ok(result.response.headers.get("set-cookie")?.toLowerCase().includes("httponly"));
    assert.ok(result.response.headers.get("cache-control")?.includes("no-store"));
  }
  const png = new Uint8Array(
    await Bun.file(new URL("./fixtures/pixel.png", import.meta.url)).arrayBuffer(),
  );
  await upload("anonymous", png, "pixel.png", "image/png", 401);
  await upload(
    "author",
    new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ),
    "unsafe.svg",
    "image/svg+xml",
    400,
  );
  const asset = await upload("author", png, "pixel.png", "image/png", 201);
  assert.equal(typeof asset.url, "string");
  const image = await fetch(new URL(asset.url, base), { signal: AbortSignal.timeout(15000) });
  assert.equal(image.status, 200, "Uploaded image can be read by its returned public URL");
  assert.ok(image.headers.get("content-type")?.includes("image/png"));
  assert.ok(image.headers.get("cache-control")?.includes("immutable"));
  assert.deepEqual(
    new Uint8Array(await image.arrayBuffer()),
    png,
    "Uploaded image bytes round-trip unchanged",
  );
  await request("reader", "/api/auth/logout", "POST");
  await request("reader", "/api/me", "GET", undefined, 401);
  userContract(
    (
      await request<User>("reader", "/api/auth/login", "POST", {
        email: readerInput.email,
        password: readerInput.password,
      })
    ).data,
  );
  await request("author", "/api/posts", "POST", {}, 403, { Origin: "https://untrusted.example" });
  let post = (await request<Post>("author", "/api/posts", "POST", {}, 201)).data;
  postContract(post);
  postId = post.id;
  const path = `/api/posts/${postId}`;
  await request("reader", path, "GET", undefined, 404);
  await request("anonymous", path, "GET", undefined, 401);
  const title = `Smoke original ${suffix}`,
    slug = `smoke-${suffix}`;
  const snapshot = {
    title,
    subtitle: "Contract fixture",
    slug,
    cover: "",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Published text" }] },
        {
          type: "image",
          attrs: { src: asset.url, alt: "Smoke image", title: null, width: null, height: null },
        },
      ],
    },
    appearance: defaultAppearance,
    visibility: "public",
  };
  const initialRevision = post.revision;
  post = (await request<Post>("author", path, "PUT", { ...snapshot, revision: post.revision }))
    .data;
  assert.ok(post.revision > initialRevision);
  await request("author", path, "PUT", { ...snapshot, revision: initialRevision }, 409);
  const publicPath = `/api/public/${authorInput.username}/${slug}`;
  const readingPath = `/@${authorInput.username}/${slug}`;
  const profilePath = `/@${authorInput.username}`;
  await request("anonymous", publicPath, "GET", undefined, 404);
  assert.ok(
    !(await request("anonymous", "/api/posts")).data.posts.some(
      (p: PostSummary) => p.id === postId,
    ),
  );
  post = (
    await request<Post>("author", `${path}/publish`, "POST", {
      revision: post.revision,
      emailSubscribers: false,
    })
  ).data;
  const live = await request<Post>("anonymous", publicPath);
  postContract(live.data);
  assert.equal(live.data.title, title);
  assert.deepEqual(live.data.content, snapshot.content, "Real editor image attributes persist");
  assert.equal(
    live.data.published,
    undefined,
    "Public responses omit duplicate document snapshots",
  );
  const feed = (await request<{ posts: PostSummary[] }>("anonymous", "/api/posts")).data;
  const summary = feed.posts.find((item) => item.id === postId);
  assert.ok(summary, "Published story appears in discovery");
  assert.equal(summary.isPublished, true);
  assert.equal(summary.excerpt, "Published text");
  assert.ok(!("content" in summary) && !("published" in summary), "Lists contain metadata only");
  await page(readingPath, 200, [title, "Published text", "Smoke image"]);
  await page(profilePath, 200, [title, authorInput.name]);
  const etag = live.response.headers.get("etag");
  assert.ok(etag, "public post supplies an ETag");
  const conditional = await fetch(base + publicPath, { headers: { "If-None-Match": etag! } });
  assert.equal(conditional.status, 304);
  post = (
    await request<Post>("author", path, "PUT", {
      ...snapshot,
      title: "PRIVATE DRAFT CHANGES",
      revision: post.revision,
    })
  ).data;
  assert.equal(
    (await request<Post>("anonymous", publicPath)).data.title,
    title,
    "draft edits never replace published snapshot",
  );
  assert.ok(JSON.stringify((await request("anonymous", "/api/posts")).data).includes(title));
  assert.ok(
    !JSON.stringify((await request("anonymous", "/api/posts")).data).includes(
      "PRIVATE DRAFT CHANGES",
    ),
  );
  await page(readingPath, 200, [title, "Published text"], ["PRIVATE DRAFT CHANGES"]);
  await request("reader", `${path}/like`, "PUT", { active: true });
  await request("reader", `${path}/like`, "PUT", { active: true });
  await request("reader", `${path}/bookmark`, "PUT", { active: true });
  const created = await request(
    "reader",
    `${path}/comments`,
    "POST",
    { body: "A smoke comment" },
    201,
  );
  commentId = created.data.id;
  const engagement = (await request("reader", `${path}/engagement`)).data;
  assert.equal(engagement.liked, true);
  assert.equal(engagement.bookmarked, true);
  assert.equal(engagement.likes, 1);
  assert.ok(engagement.comments.some((c: any) => c.id === commentId));
  assert.ok(
    (await request("reader", "/api/posts?scope=bookmarks")).data.posts.some(
      (p: PostSummary) => p.id === postId,
    ),
  );
  await request("author", `${path}/comments/${commentId}`, "DELETE");
  commentId = "";
  const revisions = (await request("author", `${path}/revisions`)).data.revisions;
  assert.ok(Array.isArray(revisions) && revisions.length > 0);
  assert.equal(revisions[0].title, title);
  assert.ok(!("snapshot" in revisions[0]), "History does not download full edition documents");
  await request("reader", `${path}/revisions`, "GET", undefined, 404);
  post = (await request<Post>("author", `${path}/unpublish`, "POST", { revision: post.revision }))
    .data;
  await request("anonymous", publicPath, "GET", undefined, 404, { "If-None-Match": etag! });
  await page(readingPath, 404);
  await page(profilePath, 200, [authorInput.name], [title]);
  assert.ok(
    !(await request("reader", "/api/posts?scope=bookmarks")).data.posts.some(
      (p: PostSummary) => p.id === postId,
    ),
  );
  await request("reader", `${path}/like`, "PUT", { active: false }, 404);
  console.log(
    "HTTP smoke passed: sessions, origin, contracts, image upload/read, ownership, draft isolation, conflicts, public HTML/profile rendering, publication, ETags, social state, revisions and unpublish.",
  );
} finally {
  if (postId) {
    try {
      await request("author", `/api/posts/${postId}`, "DELETE");
    } catch (error) {
      console.error("Smoke post cleanup failed:", error);
    }
  }
}
