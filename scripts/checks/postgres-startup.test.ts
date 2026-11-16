import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("../database/start-postgres.sh", import.meta.url));
function check(application: string, bootstrap: string, mode = "production") {
  return Bun.spawnSync(["sh", guard, "--check"], {
    env: {
      PATH: process.env.PATH,
      APP_ENV: mode,
      APP_DB_PASSWORD: application,
      POSTGRES_PASSWORD: bootstrap,
    },
  });
}
test("production rejects copied example defaults and missing local database passwords", () => {
  for (const [application, bootstrap] of [
    ["jot", "jot-admin-development"],
    ["jot", "unique-bootstrap"],
    ["unique-application", "jot-admin-development"],
    ["", "unique-bootstrap"],
    ["unique-application", ""],
  ]) {
    const result = check(application!, bootstrap!);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toBe(
      "Production database passwords must replace the development defaults.\n",
    );
  }
});
test("production preserves nondefault special-character secrets without invoking a shell value", () => {
  const secret = "reserved/@:#?='\\ $literal $(echo never-run) password";
  const result = check(secret, "separate-bootstrap-password");
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe("");
  expect(result.stderr.toString()).toBe("");
  expect(check("jot", "jot-admin-development", "development").exitCode).toBe(0);
});
