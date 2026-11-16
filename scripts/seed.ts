import {
  defaultAppearance,
  type DocNode,
  type Post,
  type PostSummary,
  type User,
} from "../packages/contracts/src";
import fixtures from "./fixtures/posts.json";

const password = process.env.SEED_PASSWORD;
if (!password || Buffer.byteLength(password) < 10 || Buffer.byteLength(password) > 72) {
  throw new Error("Set SEED_PASSWORD to an explicit 10-72 byte demo password.");
}
const base = (process.env.SEED_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const identity = {
  email: process.env.SEED_EMAIL || "demo@example.com",
  username: process.env.SEED_USERNAME || "demo",
  name: "Jot Examples",
  password,
};
let cookie = "";
async function call<T>(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  const session = response.headers.get("set-cookie");
  if (session) cookie = session.split(";")[0]!;
  return { response, data };
}
async function requireCall<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const { response, data } = await call<T>(path, method, body);
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${data.error || "Request failed"}`);
  return data;
}
let result = await call<User>("/auth/signup", "POST", identity);
if (result.response.status === 409) {
  result = await call<User>("/auth/login", "POST", { email: identity.email, password });
}
if (!result.response.ok) {
  throw new Error(
    `Demo account could not be authenticated (${result.response.status}). Existing accounts are never reset or overwritten. ${result.data.error || ""}`,
  );
}
if (result.data.username !== identity.username.toLowerCase()) {
  throw new Error(
    "Authenticated account username does not match SEED_USERNAME; no fixtures were written.",
  );
}
const existing = new Set<string>();
for (let offset = 0; ; offset += 50) {
  const page = await requireCall<{ posts: PostSummary[] }>(
    `/posts?scope=mine&limit=50&offset=${offset}`,
  );
  for (const post of page.posts) {
    existing.add(post.slug);
    if (post.reservedSlug) existing.add(post.reservedSlug);
  }
  if (page.posts.length < 50) break;
  if (offset >= 10000)
    throw new Error("Demo account exceeds API pagination bounds; no fixtures were written.");
}
for (const [index, fixture] of fixtures.entries()) {
  if (existing.has(fixture.slug)) {
    console.log(`Skipped existing fixture: ${fixture.slug}`);
    continue;
  }
  const created = await requireCall<Post>("/posts", "POST", {});
  try {
    const saved = await requireCall<Post>(`/posts/${created.id}`, "PUT", {
      ...fixture,
      content: fixture.content as DocNode,
      cover: "",
      appearance: { ...defaultAppearance, accent: index === 1 ? "blue" : "orange" },
      visibility: "public",
      revision: created.revision,
    });
    const published = await requireCall<Post>(`/posts/${created.id}/publish`, "POST", {
      revision: saved.revision,
      emailSubscribers: false,
    });
    console.log(`Created /@${result.data.username}/${published.slug}`);
  } catch (error) {
    await call(`/posts/${created.id}`, "DELETE").catch(() => undefined);
    throw error;
  }
}
console.log("Demo fixtures ready. Existing writing and account details were preserved.");
