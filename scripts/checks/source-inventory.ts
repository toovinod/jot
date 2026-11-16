import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export function excludedSourcePath(path: string) {
  const name = basename(path);
  return (
    /(^|\/)(node_modules|\.git|\.next|\.turbo|\.data|bin|coverage)(\/|$)/.test(path) ||
    /(?:\.lock|\.sum|\.tsbuildinfo)$/i.test(path) ||
    /\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|tar|gz|mp[34])$/i.test(path) ||
    ((name === ".env" || name.startsWith(".env.")) && name !== ".env.example") ||
    name === ".DS_Store" ||
    path.startsWith("docs/scaffold/")
  );
}
function archiveFiles() {
  let ignoreText = "";
  try {
    ignoreText = readFileSync(".gitignore", "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const rules = ignoreText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const negate = line.startsWith("!");
      const pattern = (negate ? line.slice(1) : line).replace(/^\//, "").replace(/\/$/, "");
      return { negate, pattern, glob: new Bun.Glob(pattern) };
    });
  function ignored(path: string) {
    if (excludedSourcePath(path)) return true;
    let ignore = false;
    for (const rule of rules) {
      if (rule.glob.match(path) || (!rule.pattern.includes("/") && rule.glob.match(basename(path))))
        ignore = !rule.negate;
    }
    return ignore;
  }
  const files: string[] = [];
  let entriesSeen = 0;
  function walk(directory: string, depth: number) {
    if (depth > 64) throw new Error("Source policy directory depth exceeds its safety bound.");
    for (const entry of readdirSync(directory || ".", { withFileTypes: true })) {
      if (++entriesSeen > 20000)
        throw new Error("Source policy inventory exceeds its safety bound.");
      const path = directory ? join(directory, entry.name) : entry.name;
      if (ignored(path)) continue;
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile()) files.push(path);
    }
  }
  walk("", 0);
  return files;
}
export function authoredSourceFiles() {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  );
  return result.status === 0
    ? [...new Set(result.stdout.split("\0").filter(Boolean))]
    : archiveFiles();
}
