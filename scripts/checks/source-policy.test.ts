import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const policy = fileURLToPath(new URL("./source-policy.ts", import.meta.url));
const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
function repository() {
  const path = mkdtempSync(join(tmpdir(), "jot-source-policy-"));
  temporary.push(path);
  expect(Bun.spawnSync(["git", "init", "--quiet"], { cwd: path }).exitCode).toBe(0);
  return path;
}
function check(path: string) {
  return Bun.spawnSync([process.execPath, policy], { cwd: path });
}
test("working tree deletion and symlink target are not read as authored files", () => {
  const root = repository();
  writeFileSync(join(root, "removed.ts"), "export const removed = true;\n");
  expect(Bun.spawnSync(["git", "add", "removed.ts"], { cwd: root }).exitCode).toBe(0);
  unlinkSync(join(root, "removed.ts"));
  const outside = mkdtempSync(join(tmpdir(), "jot-policy-private-"));
  temporary.push(outside);
  writeFileSync(join(outside, "private.txt"), String.fromCodePoint(0x2014));
  symlinkSync(join(outside, "private.txt"), join(root, "external.txt"));
  const result = check(root);
  expect(result.exitCode).toBe(0);
});
test("authored text violations fail while ignored/generated and binary assets are skipped", () => {
  const root = repository();
  writeFileSync(join(root, ".gitignore"), "ignored.txt\n");
  writeFileSync(join(root, "ignored.txt"), String.fromCodePoint(0x2014));
  writeFileSync(join(root, "image.bin"), Buffer.from([0, 255, 1]));
  expect(check(root).exitCode).toBe(0);
  writeFileSync(join(root, "source.ts"), `const value = "${String.fromCodePoint(0x1f680)}";\n`);
  const result = check(root);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("source.ts:1: emoji");
});

test("release archives and systems without Git use a bounded inventory excluding private environment files", () => {
  const root = mkdtempSync(join(tmpdir(), "jot-source-archive-"));
  temporary.push(root);
  writeFileSync(join(root, ".gitignore"), "ignored.txt\n");
  writeFileSync(join(root, "ignored.txt"), String.fromCodePoint(0x2014));
  writeFileSync(join(root, ".env"), String.fromCodePoint(0x2014));
  writeFileSync(join(root, "source.ts"), "export const archive = true;\n");
  expect(check(root).exitCode).toBe(0);
  const noGit = Bun.spawnSync([process.execPath, policy], {
    cwd: root,
    env: { PATH: "/nonexistent" },
  });
  expect(noGit.exitCode).toBe(0);
  writeFileSync(join(root, "source.ts"), String.fromCodePoint(0x2014));
  expect(check(root).exitCode).toBe(1);
});
