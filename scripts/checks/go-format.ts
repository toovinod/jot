import { spawnSync } from "node:child_process";

const result = spawnSync("gofmt", ["-l", "apps/api"], { encoding: "utf8" });
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status || 1);
}
if (result.stdout.trim()) {
  console.error("Run gofmt on these files:\n" + result.stdout.trim());
  process.exit(1);
}
