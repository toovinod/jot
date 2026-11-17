import {
  defaultAppearance,
  type Comment,
  type DocNode,
  type Post,
  type PostSummary,
  type User,
} from "../packages/contracts/src";
import fixtures from "./fixtures/posts.json";
import reactions from "./fixtures/comments.json";

const password = process.env.SEED_PASSWORD;
if (!password || Buffer.byteLength(password) < 10 || Buffer.byteLength(password) > 72) {
  throw new Error("Set SEED_PASSWORD to an explicit 10-72 byte demo password.");
}
const base = (process.env.SEED_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
// Sample accounts belong on a local development stack, never on a deployment that real readers use.
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname) &&
  process.env.SEED_ALLOW_REMOTE !== "1"
) {
  throw new Error(
    `Refusing to seed ${base}: it is not a local address. Set SEED_ALLOW_REMOTE=1 only for a disposable stack.`,
  );
}
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const author = {
  email: process.env.SEED_EMAIL || "harper@example.com",
  username: process.env.SEED_USERNAME || "harper",
  name: "Harper",
  password,
};
const reader = { email: "quinn@example.com", username: "quinn", name: "Quinn", password };
type Session = { cookie: string };
async function call<T>(session: Session, path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(session.cookie ? { Cookie: session.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  const cookie = response.headers.get("set-cookie");
  if (cookie) session.cookie = cookie.split(";")[0]!;
  return { response, data };
}
async function requireCall<T>(
  session: Session,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const { response, data } = await call<T>(session, path, method, body);
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${data.error || "Request failed"}`);
  return data;
}
// Signs up, or signs in to an account that already exists; existing accounts are never reset or overwritten.
async function signIn(identity: typeof author): Promise<Session> {
  const session = { cookie: "" };
  let result = await call<User>(session, "/auth/signup", "POST", identity);
  if (result.response.status === 409) {
    result = await call<User>(session, "/auth/login", "POST", {
      email: identity.email,
      password: identity.password,
    });
  }
  if (!result.response.ok) {
    throw new Error(
      `Sample account ${identity.username} could not be authenticated (${result.response.status}). Existing accounts are never reset or overwritten. ${result.data.error || ""}`,
    );
  }
  if (result.data.username !== identity.username.toLowerCase()) {
    throw new Error(
      `Authenticated account username does not match ${identity.username}; no fixtures were written.`,
    );
  }
  return session;
}
const writer = await signIn(author);
const existing = new Set<string>();
for (let offset = 0; ; offset += 50) {
  const page = await requireCall<{ posts: PostSummary[] }>(
    writer,
    `/posts?scope=mine&limit=50&offset=${offset}`,
  );
  for (const post of page.posts) {
    existing.add(post.slug);
    if (post.reservedSlug) existing.add(post.reservedSlug);
  }
  if (page.posts.length < 50) break;
  if (offset >= 10000)
    throw new Error("Sample account exceeds API pagination bounds; no fixtures were written.");
}
const created: Post[] = [];
for (const [index, fixture] of fixtures.entries()) {
  if (existing.has(fixture.slug)) {
    console.log(`Skipped existing fixture: ${fixture.slug}`);
    continue;
  }
  const post = await requireCall<Post>(writer, "/posts", "POST", {});
  try {
    const saved = await requireCall<Post>(writer, `/posts/${post.id}`, "PUT", {
      ...fixture,
      content: fixture.content as DocNode,
      cover: "",
      appearance: { ...defaultAppearance, accent: index % 2 === 1 ? "blue" : "orange" },
      visibility: "public",
      revision: post.revision,
    });
    const published = await requireCall<Post>(writer, `/posts/${post.id}/publish`, "POST", {
      revision: saved.revision,
      emailSubscribers: false,
    });
    created.push(published);
    console.log(`Created /@${published.author.username}/${published.slug}`);
  } catch (error) {
    await call(writer, `/posts/${post.id}`, "DELETE").catch(() => undefined);
    throw error;
  }
}
// Reader activity is added only to posts created in this run, so running the seed again never duplicates it.
if (created.length) {
  const visitor = await signIn(reader);
  for (const post of created) {
    await requireCall(visitor, `/posts/${post.id}/like`, "PUT", { active: true });
    const reaction = reactions.find((r) => r.slug === post.slug);
    if (!reaction) continue;
    const comment = await requireCall<Comment>(visitor, `/posts/${post.id}/comments`, "POST", {
      body: reaction.body,
    });
    if (reaction.reply)
      await requireCall(writer, `/posts/${post.id}/comments`, "POST", {
        body: reaction.reply,
        parentId: comment.id,
      });
  }
  console.log(`Added likes and comments from @${reader.username}.`);
}
console.log("Sample fixtures ready. Existing writing and account details were preserved.");
