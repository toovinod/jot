import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const password = "reserved/@:#?='\\ value";
const environment = {
  ...process.env,
  POSTGRES_PASSWORD: password,
  POSTGRES_ADMIN_PASSWORD: "isolated-bootstrap-test-password",
  COMPOSE_DATABASE_URL: "",
  JOT_SUBNET: "172.31.97.0/24",
  JOT_WEB_IP: "172.31.97.254",
};
function compose(files: string[] = [], extra: Record<string, string> = {}) {
  return spawnSync(
    "docker",
    ["compose", ...files, "--profile", "app", "config", "--format", "json"],
    {
      env: { ...environment, ...extra },
      encoding: "utf8",
    },
  );
}
function configuration(files: string[] = [], extra: Record<string, string> = {}) {
  const result = compose(files, extra);
  assert.equal(result.status, 0, "Compose configuration must resolve successfully");
  return JSON.parse(result.stdout);
}
const local = configuration();
assert.deepEqual(local.services.postgres.command, ["postgres"]);
assert.ok(
  local.services.postgres.volumes.some(
    (mount: { source: string; target: string }) =>
      mount.source === "postgres18" && mount.target === "/var/lib/postgresql",
  ),
  "PostgreSQL 18 must use a separate volume at the versioned data directory's parent",
);
assert.equal(local.services.api.environment.PGPASSWORD, password);
assert.equal(new URL(local.services.api.environment.DATABASE_URL).password, "");
assert.equal(local.services.postgres.environment.APP_DB_PASSWORD, password);
assert.equal(local.services.api.environment.TRUSTED_PROXY_CIDRS, "172.31.97.254/32");
assert.equal(local.services.web.networks.default.ipv4_address, "172.31.97.254");
assert.ok(!local.services.web.ports && !local.services.api.ports);
const productionFiles = ["-f", "compose.yaml", "-f", "compose.production.yaml"];
const production = configuration(productionFiles, { SITE_ADDRESS: "writing.example.com" });
assert.ok(!production.services.postgres.ports);
assert.deepEqual(
  production.services.ingress.ports.map((port: { published: string }) => port.published),
  ["80", "443", "443"],
);
for (const name of ["migrate", "api", "worker"]) {
  assert.equal(production.services[name].environment.APP_ENV, "production");
  assert.equal(production.services[name].environment.APP_ORIGIN, "https://writing.example.com");
}
assert.notEqual(compose(productionFiles, { SITE_ADDRESS: "" }).status, 0);
const hosted = configuration([], {
  COMPOSE_DATABASE_URL: "postgres://user:explicit@neon.example/jot?sslmode=require",
});
assert.equal(
  hosted.services.api.environment.DATABASE_URL,
  "postgres://user:explicit@neon.example/jot?sslmode=require",
);
console.log(
  "Compose configuration passed: literal passwords, private app ports, exact proxy trust, hosted database override and production TLS.",
);
