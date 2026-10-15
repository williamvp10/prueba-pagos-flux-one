const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const yaml = require("../packages/backend-kit/node_modules/js-yaml");
test("[OPS-02] Compose limits runtime credentials to their owning service", () => {
  const c = yaml.load(fs.readFileSync("docker-compose.yml", "utf8"));
  for (const service of ["auth", "payments", "audit"]) {
    const env = c.services[service].environment;
    const prefix = service.toUpperCase();
    assert.ok(env[prefix + "_DB_USER"]);
    assert.ok(env[prefix + "_DB_PASSWORD"]);
    assert.ok(!env.POSTGRES_PASSWORD);
    for (const other of ["AUTH", "PAYMENTS", "AUDIT"])
      if (other !== prefix) assert.ok(!env[other + "_DB_PASSWORD"]);
    assert.equal(!!env.JWT_PRIVATE_KEY_B64, service === "auth");
  }
  for (const key of Object.keys(c.services.web.environment))
    assert.ok(!/PASSWORD|PRIVATE_KEY|DB_USER|RABBITMQ/.test(key));
  assert.ok(!c.services.seed.environment.AUDIT_DB_PASSWORD);
  assert.ok(!c.services.postgres.ports);
  assert.ok(!c.services.rabbitmq.ports);
});
