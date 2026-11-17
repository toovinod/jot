import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Demo } from "../src/components/landing/demo";

test("demo renders the sample note in sans", () => {
  const markup = renderToStaticMarkup(<Demo />);
  const html = markup.replace(/<[^>]+>/g, "");
  expect(html).toContain("try the editor.");
  expect(html).toContain(
    "write, change the look, publish. everything here resets when you reload.",
  );
  expect(html).toContain("what carried the load");
  expect(html).toContain("how we scaled postgres to a million reads a second");
  expect(html).toContain("live · 2,400 reads");
  expect(html).toContain(".md export");
  expect(html).not.toContain("/2000");
  expect(markup).toContain('placeholder="type a line and press enter to add it"');
  expect(html).toContain("unlisted · link only");
  expect(html).toContain("draft · share link on");
  expect(markup).toMatch(/<article[^>]*font-sans/);
  expect(markup).toMatch(
    /role="radio" aria-checked="true"[^>]*>(<span[^>]*><\/span>)?<span[^>]*>sans</,
  );
});

test("the sample note budgets pgbouncer connections across every pooler", async () => {
  const { parseDemoNote } = await import("../src/components/landing/demo-parse");
  const { POSTGRES_POST: SAMPLE_NOTE } = await import("../src/components/landing/posts");
  expect(SAMPLE_NOTE).toStartWith("# how we scaled postgres");
  const code = parseDemoNote(SAMPLE_NOTE).find((block) => block.kind === "code")!;
  expect(code.text).toStartWith(
    "; excerpt: the same on all four instances\n[databases]\napp = host=primary.internal dbname=app\n",
  );
  for (const line of [
    "[pgbouncer]",
    "pool_mode = transaction",
    "default_pool_size = 100",
    "max_db_connections = 100",
    "max_prepared_statements = 200",
  ])
    expect(code.text).toContain(line);
  expect(code.text).not.toContain("max_db_connections = 400");
  expect(SAMPLE_NOTE).toContain(
    "we budget server connections across all of them: each gets max_db_connections = 100, so the primary never sees more than 400.",
  );
  expect(SAMPLE_NOTE).toContain("no horizontal sharding");
  expect(SAMPLE_NOTE).toContain("protocol-level named prepared statements");
  expect(SAMPLE_NOTE).toContain("SET LOCAL inside transactions");
  expect(SAMPLE_NOTE).not.toMatch(/never on the session|bumped them by a million/);
});

test("the sample posts keep their numbers straight", async () => {
  const { BUDGET_POST, EVALS_POST, SCHEMA_POST } = await import("../src/components/landing/posts");
  expect(EVALS_POST).toContain("about half a percentage point");
  expect(EVALS_POST).not.toContain("two point win");
  expect(EVALS_POST).toContain("task.mustFix.length > 0");
  expect(BUDGET_POST.match(/"aggregationMethod": "median"/g)).toHaveLength(4);
  expect(BUDGET_POST).toContain("170 KB is our transfer-size cap");
  expect(SCHEMA_POST).toContain("as query_age");
  expect(SCHEMA_POST).toContain("eight minutes in");
  expect(SCHEMA_POST).toContain(
    "ordinary reads and writes continue, but other schema changes on the table wait.",
  );
});

test("demo never injects raw HTML", () => {
  const source = readFileSync(
    new URL("../src/components/landing/demo.tsx", import.meta.url),
    "utf8",
  );
  expect(source).not.toContain("dangerouslySetInnerHTML");
});

test("the four sample posts are distinct, full-length engineering posts", async () => {
  const { DEMO_LIMIT, parseDemoNote, demoTitle } =
    await import("../src/components/landing/demo-parse");
  const posts = Object.values(await import("../src/components/landing/posts"));
  expect(posts).toHaveLength(4);
  expect(new Set(posts.map(demoTitle)).size).toBe(4);
  for (const post of posts) {
    const words = post.match(/[\p{L}\p{N}']+/gu)!.length;
    expect(words).toBeGreaterThanOrEqual(700);
    expect(words).toBeLessThanOrEqual(1200);
    const blocks = parseDemoNote(post);
    // Nothing is cut off by the demo limit: the last line of the post is still there.
    expect(post.length).toBeLessThan(DEMO_LIMIT);
    expect(blocks.at(-1)!.text).toBe(post.trim().split("\n").at(-1)!.trim());
    expect(blocks.filter((block) => block.kind === "h2").length).toBeGreaterThanOrEqual(4);
    expect(blocks.some((block) => block.kind === "li")).toBe(true);
    expect(post).toMatch(/^```(ini|sql|ts|json)$/m);
    expect(post).not.toMatch(/\u2014|@you/);
  }
});

test("the schema post keeps the index in its own migration", async () => {
  const { SCHEMA_POST } = await import("../src/components/landing/posts");
  expect(SCHEMA_POST).toContain(
    "-- 0042_add_region.sql\nset lock_timeout = '3s';\nalter table orders add column region text;\n\n-- 0043_index_region.sql (no transaction: concurrently can't run inside one)\ncreate index concurrently orders_region_idx on orders (region);",
  );
});
