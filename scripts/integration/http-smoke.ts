import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SQL } from "bun";
import {
  defaultAppearance,
  type BlockedReader,
  type Comment,
  type CustomDomain,
  type DocNode,
  type Engagement,
  type Post,
  type PostSummary,
  type RevisionSummary,
  type SitemapEntry,
  type SubscriberPage,
  type User,
} from "../../packages/contracts/src";

// Run only against an isolated database: this exercises real persistence and auth.
const base = (process.env.JOT_SMOKE_URL || "http://localhost:3000").replace(/\/$/, "");
const origin = process.env.APP_ORIGIN || new URL(base).origin;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const actors = {
  author: { cookie: "" },
  reader: { cookie: "" },
  friend: { cookie: "" },
  anonymous: { cookie: "" },
};
// Optional direct access to the same disposable database, used only to read or plant the secret tokens that email
// would deliver (verification, subscription confirmation) and to mark a custom domain verified without DNS.
const db = process.env.JOT_SMOKE_DATABASE_URL ? new SQL(process.env.JOT_SMOKE_DATABASE_URL) : null;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const randomHex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const passed: string[] = [];
async function step(name: string, run: () => Promise<void>) {
  await run();
  passed.push(name);
  console.log(`ok - ${name}`);
}
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
  readerInput = credentials("reader"),
  friendInput = credentials("friend");
const users = {} as Record<"author" | "reader" | "friend", User>;
const createdPosts: string[] = [];
let postId = "",
  commentId = "",
  authorDeleted = false;
const paragraph = (text: string): DocNode => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
function draft(title: string, slug: string, extra: Record<string, unknown> = {}) {
  return {
    title,
    subtitle: "Full-stack proof",
    slug,
    cover: "",
    content: { type: "doc", content: [paragraph(`${title} body`)] },
    appearance: defaultAppearance,
    visibility: "public",
    tags: [],
    ...extra,
  };
}
async function savePost(post: Post, fields: Record<string, unknown>) {
  return (
    await request<Post>("author", `/api/posts/${post.id}`, "PUT", {
      ...draft(post.title, post.slug),
      tags: post.tags,
      ...fields,
      revision: post.revision,
    })
  ).data;
}
async function publishPost(post: Post) {
  return (
    await request<Post>("author", `/api/posts/${post.id}/publish`, "POST", {
      revision: post.revision,
      emailSubscribers: false,
    })
  ).data;
}
async function createPost(title: string, slug: string, extra: Record<string, unknown> = {}) {
  const post = (await request<Post>("author", "/api/posts", "POST", {}, 201)).data;
  createdPosts.push(post.id);
  return savePost(post, draft(title, slug, extra));
}
async function engagementOf(actor: Actor, id: string) {
  return (await request<Engagement>(actor, `/api/posts/${id}/engagement`)).data;
}
async function summaryOf(id: string) {
  const mine = (await request<{ posts: PostSummary[] }>("author", "/api/posts?scope=mine&limit=50"))
    .data.posts;
  const found = mine.find((p) => p.id === id);
  assert.ok(found, `library lists ${id}`);
  return found;
}
async function text(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
    ...init,
  });
  return { response, body: await response.text() };
}
async function eventually(what: string, timeoutMs: number, check: () => Promise<boolean>) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    assert.ok(Date.now() < deadline, `timed out waiting for ${what}`);
    await Bun.sleep(5000);
  }
}
const tag = `t${suffix}`;
let scheduled: Post | undefined;
try {
  await request("anonymous", "/api/health");
  const { data: config } = await request("anonymous", "/api/config");
  assert.equal(typeof config.aiEnabled, "boolean");
  assert.equal(typeof config.emailEnabled, "boolean");
  await request("anonymous", "/api/me", "GET", undefined, 401);
  for (const [actor, input] of [
    ["author", authorInput],
    ["reader", readerInput],
    ["friend", friendInput],
  ] as const) {
    const result = await request<User>(actor, "/api/auth/signup", "POST", input, 201);
    userContract(result.data);
    users[actor] = result.data;
    assert.ok(result.response.headers.get("set-cookie")?.toLowerCase().includes("httponly"));
    assert.ok(result.response.headers.get("cache-control")?.includes("no-store"));
  }
  // Scheduled first, so the worker's once-a-minute pass runs while the rest of the smoke does.
  await step("schedule window, cancel and reschedule", async () => {
    let post = await createPost(`Smoke scheduled ${suffix}`, `scheduled-${suffix}`);
    const at = (ms: number) => new Date(Date.now() + ms).toISOString();
    const early = await request(
      "author",
      `/api/posts/${post.id}/schedule`,
      "POST",
      { at: at(30_000), emailSubscribers: false, revision: post.revision },
      400,
    );
    assert.equal(early.data.code, "validation");
    post = (
      await request<Post>("author", `/api/posts/${post.id}/schedule`, "POST", {
        at: at(10 * 60_000),
        emailSubscribers: false,
        revision: post.revision,
      })
    ).data;
    assert.ok(post.scheduledAt && !post.published, "schedule recorded without publishing");
    assert.ok((await summaryOf(post.id)).scheduledAt, "library shows the schedule");
    post = (await request<Post>("author", `/api/posts/${post.id}/schedule`, "DELETE")).data;
    assert.equal(post.scheduledAt, undefined);
    scheduled = (
      await request<Post>("author", `/api/posts/${post.id}/schedule`, "POST", {
        at: at(125_000),
        emailSubscribers: false,
        revision: post.revision,
      })
    ).data;
  });
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
  passed.push("core flow");

  await step("email verification state", async () => {
    const token = randomHex();
    if (!config.emailEnabled) {
      const queued = await request("author", "/api/auth/verification/request", "POST", {}, 503);
      assert.equal(queued.data.code, "email_unavailable");
    }
    const bogus = await request(
      "anonymous",
      "/api/auth/verification/confirm",
      "POST",
      { token },
      400,
    );
    assert.equal(bogus.data.code, "invalid_token");
    if (!db) return;
    const [row] = await db`SELECT email_verified FROM users WHERE id=${users.author.id}`;
    assert.equal(row.email_verified, false, "new accounts start unverified");
    const [queued] =
      await db`SELECT count(*)::int n FROM jobs WHERE kind='verification' AND user_id=${users.author.id}`;
    assert.equal(
      queued.n,
      config.emailEnabled ? 1 : 0,
      "signup queues verification only with email",
    );
    // Plant the link email would have delivered, then confirm it through the API.
    await db`INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES(${sha256(token)},${users.author.id},'verification',now()+interval '1 hour')`;
    await request("anonymous", "/api/auth/verification/confirm", "POST", { token });
    const [after] = await db`SELECT email_verified FROM users WHERE id=${users.author.id}`;
    assert.equal(after.email_verified, true);
    await request("anonymous", "/api/auth/verification/confirm", "POST", { token }, 400);
  });

  let essay = await createPost(`Edition one ${suffix}`, `essay-${suffix}`, { tags: [tag] });
  await step("editions and restore", async () => {
    essay = await publishPost(essay);
    essay = await publishPost(await savePost(essay, { title: `Edition two ${suffix}` }));
    const history = (
      await request<{ revisions: RevisionSummary[] }>("author", `/api/posts/${essay.id}/revisions`)
    ).data.revisions;
    assert.deepEqual(
      history.map((r) => [r.number, r.title]),
      [
        [2, `Edition two ${suffix}`],
        [1, `Edition one ${suffix}`],
      ],
    );
    essay = (
      await request<Post>("author", `/api/posts/${essay.id}/restore`, "POST", {
        revision: essay.revision,
        versionId: history[1]!.id,
      })
    ).data;
    assert.equal(essay.title, `Edition one ${suffix}`, "restore replaces the draft");
    assert.equal(essay.published?.title, `Edition two ${suffix}`, "restore leaves the live copy");
    await request(
      "author",
      `/api/posts/${essay.id}/restore`,
      "POST",
      { revision: essay.revision - 1, versionId: history[0]!.id },
      409,
    );
    essay = await publishPost(
      await savePost(essay, { title: `Smoke essay ${suffix}`, subtitle: "postgres notes" }),
    );
    const live = (
      await request<Post>("anonymous", `/api/public/${users.author.username}/${essay.slug}`)
    ).data;
    assert.equal(live.title, `Smoke essay ${suffix}`);
    assert.deepEqual(live.tags, [tag]);
  });

  let quiet = await createPost(`Smoke quiet ${suffix}`, `quiet-${suffix}`, { tags: [tag] });
  quiet = await publishPost(quiet);
  await step("tags, discover search, tag filter and popular", async () => {
    await request("reader", `/api/posts/${essay.id}/like`, "PUT", { active: true });
    const feed = async (query: string) =>
      (await request<{ posts: PostSummary[] }>("anonymous", `/api/posts?${query}`)).data.posts;
    assert.deepEqual(
      (await feed(`q=${encodeURIComponent(`essay ${suffix}`)}`)).map((p) => p.id),
      [essay.id],
      "search matches the title",
    );
    assert.deepEqual(
      (await feed(`q=${encodeURIComponent("POSTGRES NOTES")}&tag=${tag}`)).map((p) => p.id),
      [essay.id],
      "search is a case-insensitive subtitle match",
    );
    assert.deepEqual(
      (await feed(`tag=${tag}`)).map((p) => p.id),
      [quiet.id, essay.id],
      "tag filter, newest first",
    );
    assert.deepEqual(
      (await feed(`tag=${tag}&sort=popular`)).map((p) => p.id),
      [essay.id, quiet.id],
      "popular puts the liked post first",
    );
    assert.equal(
      (await request("anonymous", "/api/posts?tag=Not!A!Tag", "GET", undefined, 400)).data.code,
      "validation",
    );
    const mine = (
      await request<{ posts: PostSummary[] }>("author", `/api/posts?scope=mine&tag=${tag}&q=quiet`)
    ).data.posts;
    assert.deepEqual(
      mine.map((p) => p.id),
      [quiet.id],
    );
    await page(`/discover?tag=${tag}`, 200);
  });

  await step("likes and bookmarks", async () => {
    await request("reader", `/api/posts/${essay.id}/like`, "PUT", { active: true });
    await request("friend", `/api/posts/${essay.id}/like`, "PUT", { active: true });
    await request("friend", `/api/posts/${essay.id}/like`, "PUT", { active: false });
    await request("friend", `/api/posts/${essay.id}/bookmark`, "PUT", { active: true });
    const state = await engagementOf("friend", essay.id);
    assert.equal(state.likes, 1);
    assert.equal(state.liked, false);
    assert.equal(state.bookmarked, true);
    assert.equal((await summaryOf(essay.id)).likes, 1);
    const saved = (await request<{ posts: PostSummary[] }>("friend", "/api/posts?scope=bookmarks"))
      .data.posts;
    assert.deepEqual(
      saved.map((p) => p.id),
      [essay.id],
    );
    await request("anonymous", `/api/posts/${essay.id}/like`, "PUT", { active: true }, 401);
  });

  let readerThread: Comment, authorReply: Comment;
  await step("comments, replies and comments off", async () => {
    readerThread = (
      await request<Comment>(
        "reader",
        `/api/posts/${essay.id}/comments`,
        "POST",
        { body: "reader thread" },
        201,
      )
    ).data;
    authorReply = (
      await request<Comment>(
        "author",
        `/api/posts/${essay.id}/comments`,
        "POST",
        { body: "author reply", parentId: readerThread.id },
        201,
      )
    ).data;
    assert.equal(authorReply.parentId, readerThread.id);
    const nested = await request(
      "reader",
      `/api/posts/${essay.id}/comments`,
      "POST",
      { body: "too deep", parentId: authorReply.id },
      400,
    );
    assert.equal(nested.data.code, "invalid_parent");
    await request(
      "friend",
      `/api/posts/${essay.id}/comments`,
      "POST",
      { body: "friend thread" },
      201,
    );
    const state = await engagementOf("anonymous", essay.id);
    assert.equal(state.comments.length, 3);
    assert.equal(state.comments.find((c) => c.id === authorReply.id)?.parentId, readerThread.id);
    assert.equal((await summaryOf(essay.id)).comments, 3);
    quiet = await publishPost(await savePost(quiet, { commentsOff: true }));
    const off = await request(
      "reader",
      `/api/posts/${quiet.id}/comments`,
      "POST",
      { body: "late" },
      403,
    );
    assert.equal(off.data.code, "comments_off");
    assert.equal((await engagementOf("anonymous", quiet.id)).commentsOff, true);
  });

  await step("block and unblock a reader", async () => {
    assert.deepEqual((await request<BlockedReader[]>("author", "/api/me/blocked")).data, []);
    assert.equal(
      (await request("author", "/api/me/blocked", "POST", { userId: users.author.id }, 400)).data
        .code,
      "validation",
    );
    await request("author", "/api/me/blocked", "POST", { userId: crypto.randomUUID() }, 404);
    const blocked = (
      await request<BlockedReader>("author", "/api/me/blocked", "POST", { userId: users.reader.id })
    ).data;
    userContract(blocked.user);
    assert.equal(blocked.user.id, users.reader.id);
    assert.ok(Number.isFinite(Date.parse(blocked.blockedAt)));
    const again = (
      await request<BlockedReader>("author", "/api/me/blocked", "POST", { userId: users.reader.id })
    ).data;
    assert.equal(again.blockedAt, blocked.blockedAt, "blocking twice keeps the first time");
    assert.deepEqual(
      (await request<BlockedReader[]>("author", "/api/me/blocked")).data.map((b) => b.user.id),
      [users.reader.id],
    );
    for (const id of [essay.id, quiet.id]) {
      const refused = await request(
        "reader",
        `/api/posts/${id}/comments`,
        "POST",
        { body: "still here?" },
        403,
      );
      assert.equal(refused.data.code, id === essay.id ? "blocked" : "comments_off");
    }
    // The reader's thread and the author's reply to it are hidden; the friend's thread stays.
    const hidden = await engagementOf("anonymous", essay.id);
    assert.deepEqual(
      hidden.comments.map((c) => c.body),
      ["friend thread"],
    );
    assert.equal((await summaryOf(essay.id)).comments, 1);
    await request("reader", `/api/posts/${essay.id}/like`, "PUT", { active: true });
    await request("reader", `/api/posts/${essay.id}/bookmark`, "PUT", { active: true });
    assert.deepEqual((await request<BlockedReader[]>("reader", "/api/me/blocked")).data, []);
    await request("author", `/api/me/blocked/${users.reader.id}`, "DELETE");
    await request("author", `/api/me/blocked/${users.reader.id}`, "DELETE");
    assert.deepEqual((await request<BlockedReader[]>("author", "/api/me/blocked")).data, []);
    assert.equal((await engagementOf("anonymous", essay.id)).comments.length, 3);
    assert.equal((await summaryOf(essay.id)).comments, 3);
    await request("reader", `/api/posts/${essay.id}/comments`, "POST", { body: "back again" }, 201);
  });

  await step("views count readers once and skip the author", async () => {
    const view = (actor: Actor) =>
      request(actor, `/api/posts/${essay.id}/view`, "POST", undefined, 204);
    await view("author");
    assert.equal((await summaryOf(essay.id)).views, 0, "author visits are not counted");
    await view("anonymous");
    await view("anonymous");
    await view("reader");
    await view("reader");
    assert.equal((await summaryOf(essay.id)).views, 2);
    const live = (
      await request<Post>("anonymous", `/api/public/${users.author.username}/${essay.slug}`)
    ).data;
    assert.equal(live.views, 2);
    await request("anonymous", `/api/posts/${crypto.randomUUID()}/view`, "POST", undefined, 204);
  });

  await step("private share links", async () => {
    const secret = await createPost(`Smoke secret ${suffix}`, `secret-${suffix}`);
    await request("reader", `/api/posts/${secret.id}/share`, "POST", undefined, 404);
    const first = (
      await request<{ token: string }>("author", `/api/posts/${secret.id}/share`, "POST")
    ).data.token;
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    const shared = await request("anonymous", `/api/shared/${first}`);
    assert.equal(shared.data.title, `Smoke secret ${suffix}`);
    assert.equal(shared.response.headers.get("x-robots-tag"), "noindex");
    assert.ok(!("shareToken" in shared.data) && !("revision" in shared.data));
    await page(`/share/${first}`, 200, [`Smoke secret ${suffix}`, "noindex"]);
    const owner = (await request<Post>("author", `/api/posts/${secret.id}`)).data;
    assert.equal(owner.shareToken, first);
    const second = (
      await request<{ token: string }>("author", `/api/posts/${secret.id}/share`, "POST")
    ).data.token;
    await request("anonymous", `/api/shared/${first}`, "GET", undefined, 404);
    await request("anonymous", `/api/shared/${second}`);
    await request("author", `/api/posts/${secret.id}/share`, "DELETE");
    await request("anonymous", `/api/shared/${second}`, "GET", undefined, 404);
    await page(`/share/${second}`, 404);
  });

  await step("long documents save through the web origin", async () => {
    // About 80,000 words of ordinary prose, then the largest document the API accepts (over 2 MiB of JSON).
    const words =
      "we watched the read path slow down during peak traffic so we checked the query plan again".split(
        " ",
      );
    const sentence = (n: number) =>
      Array.from({ length: n }, (_, i) => words[i % words.length]).join(" ");
    const long: DocNode = { type: "doc", content: [] };
    for (let i = 0; i < 800; i++) {
      if (i % 5 === 0)
        long.content!.push({
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: `part ${i / 5 + 1}` }],
        });
      long.content!.push(paragraph(sentence(100)));
    }
    let big = await createPost(`Smoke long ${suffix}`, `long-${suffix}`);
    big = await savePost(big, { content: long });
    assert.ok(big.content.content!.length >= 960);
    const largest: DocNode = { type: "doc", content: [{ type: "paragraph" }] };
    for (let i = 0; i < 24_999; i++)
      largest.content!.push({
        type: "paragraph",
        content: [{ type: "text", text: "a".repeat(20), marks: [{ type: "bold" }] }],
      });
    assert.ok(JSON.stringify(largest).length > 2 << 20);
    big = await savePost(big, { content: largest });
    assert.equal(big.content.content!.length, 25_000);
    largest.content!.push(paragraph("one node too many"));
    await request(
      "author",
      `/api/posts/${big.id}`,
      "PUT",
      { ...draft(big.title, big.slug), content: largest, revision: big.revision },
      400,
    );
  });

  await step("subscribe, confirm and unsubscribe", async () => {
    const email = `smoke-subscriber-${suffix}@example.com`;
    const subscribe = await request(
      "anonymous",
      `/api/authors/${users.author.username}/subscribe`,
      "POST",
      { email },
      config.emailEnabled ? 200 : 503,
    );
    if (!config.emailEnabled) assert.equal(subscribe.data.code, "email_unavailable");
    assert.equal(
      (
        await request(
          "anonymous",
          "/api/subscriptions/confirm",
          "POST",
          { token: randomHex() },
          400,
        )
      ).data.code,
      "invalid_token",
    );
    // An unknown token gets the same answer as a known one, so links can't be probed.
    await request("anonymous", "/api/subscriptions/unsubscribe", "POST", { token: randomHex() });
    if (!db) return;
    let confirmToken = randomHex(),
      unsubscribeToken = randomHex();
    if (config.emailEnabled) {
      const [job] =
        await db`SELECT payload FROM jobs WHERE kind='confirmation' AND user_id=${users.author.id} ORDER BY created_at DESC LIMIT 1`;
      ({ confirmToken, unsubscribeToken } = job.payload);
    } else {
      // Without an email provider the API refuses new subscriptions, so plant the pending row email would confirm.
      await db`INSERT INTO subscriptions(id,author_id,email,confirm_hash,unsubscribe_hash,unsubscribe_token,confirm_expires) VALUES(${crypto.randomUUID()},${users.author.id},${email},${sha256(confirmToken)},${sha256(unsubscribeToken)},${unsubscribeToken},now()+interval '24 hours')`;
    }
    const before = (await request<SubscriberPage>("author", "/api/me/subscribers")).data;
    assert.equal(before.total, 0, "unconfirmed addresses are not subscribers");
    await request("anonymous", "/api/subscriptions/confirm", "POST", { token: confirmToken });
    await request("anonymous", "/api/subscriptions/confirm", "POST", { token: confirmToken });
    const after = (await request<SubscriberPage>("author", "/api/me/subscribers")).data;
    assert.equal(after.total, 1);
    assert.equal(after.items[0]!.email, email);
    await request("anonymous", "/api/subscriptions/unsubscribe", "POST", {
      token: unsubscribeToken,
    });
    assert.equal((await request<SubscriberPage>("author", "/api/me/subscribers")).data.total, 0);
    await request("anonymous", "/api/subscriptions/confirm", "POST", { token: confirmToken }, 400);
  });

  await step("custom domain endpoints", async () => {
    const domain = `smoke-${suffix}.example.com`;
    assert.equal((await request("author", "/api/me/domain")).data, null);
    if (!config.domainTarget) {
      const off = await request("author", "/api/me/domain", "PUT", { domain }, 503);
      assert.equal(off.data.code, "domains_unavailable");
      await request("anonymous", `/api/domains/allowed?domain=${domain}`, "GET", undefined, 404);
      return;
    }
    await request("author", "/api/me/domain", "PUT", { domain: "localhost" }, 400);
    const set = (await request<CustomDomain>("author", "/api/me/domain", "PUT", { domain })).data;
    assert.deepEqual(
      { domain: set.domain, verified: set.verified, txtName: set.txtName, target: set.target },
      { domain, verified: false, txtName: `_jot.${domain}`, target: config.domainTarget },
    );
    assert.match(set.txtValue, /^jot-verify=/);
    // No TXT record exists for this name, so verification must fail without changing anything.
    const unverified = await request("author", "/api/me/domain/verify", "POST", undefined, 400);
    assert.equal(unverified.data.code, "domain_unverified");
    await request("anonymous", `/api/domains/resolve?host=${domain}`, "GET", undefined, 404);
    await request("anonymous", `/api/domains/allowed?domain=${domain}`, "GET", undefined, 404);
    if (db) {
      await db`UPDATE custom_domains SET verified_at=now() WHERE user_id=${users.author.id}`;
      assert.equal((await request("author", "/api/me/domain")).data.verified, true);
      assert.deepEqual((await request("anonymous", `/api/domains/resolve?host=${domain}`)).data, {
        username: users.author.username,
      });
      await request("anonymous", `/api/domains/allowed?domain=${domain}`);
      const home = await text("/", { headers: { Host: domain, Accept: "text/html" } });
      assert.equal(home.response.status, 200, "verified domain serves the author's page");
      assert.ok(
        home.body.includes(`Smoke essay ${suffix}`),
        "custom domain home lists the author's posts",
      );
      const post = await text(`/${essay.slug}`, { headers: { Host: domain, Accept: "text/html" } });
      assert.equal(post.response.status, 200);
      assert.ok(
        post.body.includes(`Smoke essay ${suffix}`),
        "custom domain serves the post at /slug",
      );
    }
    await request("author", "/api/me/domain", "DELETE");
    assert.equal((await request("author", "/api/me/domain")).data, null);
    await request("anonymous", `/api/domains/resolve?host=${domain}`, "GET", undefined, 404);
  });

  await step("worker publishes the scheduled post", async () => {
    assert.ok(scheduled?.scheduledAt);
    await eventually(
      "the scheduled publish",
      Date.parse(scheduled.scheduledAt) - Date.now() + 150_000,
      async () => {
        const post = (await request<Post>("author", `/api/posts/${scheduled!.id}`)).data;
        return post.published !== undefined && post.scheduledAt === undefined;
      },
    );
    const live = (
      await request<Post>("anonymous", `/api/public/${users.author.username}/${scheduled.slug}`)
    ).data;
    assert.equal(live.title, `Smoke scheduled ${suffix}`);
  });

  await step("RSS feeds", async () => {
    const authorFeed = await text(`/@${users.author.username}/rss.xml`);
    assert.equal(authorFeed.response.status, 200);
    assert.ok(authorFeed.response.headers.get("content-type")?.includes("application/rss+xml"));
    for (const title of [
      `Smoke essay ${suffix}`,
      `Smoke quiet ${suffix}`,
      `Smoke scheduled ${suffix}`,
    ])
      assert.ok(authorFeed.body.includes(title), `author feed lists ${title}`);
    assert.ok(!authorFeed.body.includes(`Smoke secret ${suffix}`), "drafts stay out of feeds");
    assert.ok(authorFeed.body.includes(`<category>${tag}</category>`));
    // Feeds are cached for up to a minute per API process.
    await eventually("the site feed", 75_000, async () =>
      (await text("/rss.xml")).body.includes(`Smoke scheduled ${suffix}`),
    );
  });

  await step("sitemap", async () => {
    await eventually("the sitemap entry", 75_000, async () => {
      const entries = (await request<SitemapEntry[]>("anonymous", "/api/sitemap")).data;
      return entries.some((e) => e.username === users.author.username && e.slug === essay.slug);
    });
    const xml = await text("/sitemap.xml");
    assert.equal(xml.response.status, 200);
    assert.ok(
      xml.body.includes(`/@${users.author.username}/${essay.slug}`),
      "sitemap.xml lists the post",
    );
  });

  await step("export zip", async () => {
    const exported = await fetch(`${base}/api/me/export`, {
      headers: { Cookie: actors.author.cookie },
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get("content-type"), "application/zip");
    const bytes = new Uint8Array(await exported.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 2)), "PK");
    // Zip entry names are stored uncompressed.
    const names = new TextDecoder("latin1").decode(bytes);
    for (const name of [
      `essay-${suffix}.md`,
      `published/essay-${suffix}.md`,
      `secret-${suffix}.md`,
    ])
      assert.ok(names.includes(name), `export contains ${name}`);
  });

  await step("account deletion", async () => {
    const wrong = await request(
      "author",
      "/api/me",
      "DELETE",
      { password: "not the password" },
      403,
    );
    assert.equal(wrong.data.code, "invalid_password");
    await request("author", "/api/me", "DELETE", { password: authorInput.password });
    authorDeleted = true;
    await request("author", "/api/me", "GET", undefined, 401);
    await request(
      "anonymous",
      `/api/public/${users.author.username}/${essay.slug}`,
      "GET",
      undefined,
      404,
    );
    await request("anonymous", `/api/authors/${users.author.username}`, "GET", undefined, 404);
    await request(
      "author",
      "/api/auth/login",
      "POST",
      { email: authorInput.email, password: authorInput.password },
      401,
    );
    assert.ok(
      !(await request<{ posts: PostSummary[] }>("reader", "/api/posts?scope=bookmarks")).data.posts
        .length,
      "bookmarks of deleted posts disappear",
    );
    if (db) {
      const [left] =
        await db`SELECT (SELECT count(*) FROM posts WHERE author_id=${users.author.id})::int posts,(SELECT count(*) FROM comments WHERE user_id=${users.author.id})::int comments,(SELECT count(*) FROM subscriptions WHERE author_id=${users.author.id})::int subscriptions`;
      assert.deepEqual(left, { posts: 0, comments: 0, subscriptions: 0 });
    }
  });
  console.log(`Full-stack smoke passed ${passed.length} checks: ${passed.join("; ")}.`);
} finally {
  if (!authorDeleted) {
    for (const id of [postId, ...createdPosts].filter(Boolean)) {
      try {
        await request("author", `/api/posts/${id}`, "DELETE");
      } catch (error) {
        console.error("Smoke post cleanup failed:", error);
      }
    }
  }
  await db?.close();
}
