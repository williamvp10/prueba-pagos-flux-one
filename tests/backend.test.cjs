const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const http = require("node:http");
require("../tools/load-env.cjs");
const { database, serviceDocument } = require("../packages/backend-kit");
const { Client } = require("../packages/backend-kit/node_modules/pg");
const Ajv = require("../packages/backend-kit/node_modules/ajv");
const addFormats = require("../packages/backend-kit/node_modules/ajv-formats");
const { apiContract } = require("../packages/backend-kit");
const contract = apiContract();
const contractValidator = new Ajv({ strict: false });
addFormats(contractValidator);
contractValidator.addSchema({ components: contract.components }, "api");
function checkContract(path, method, status, body) {
  const resource = path.split("?")[0];
  const entry = Object.entries(contract.paths).find(([pattern]) =>
    new RegExp("^" + pattern.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(
      resource,
    ),
  );
  assert.ok(entry, resource);
  const op = entry[1][method.toLowerCase()];
  assert.ok(op, method + resource);
  let response = op.responses[String(status)];
  assert.ok(
    response,
    "Undocumented HTTP status " + status + " for " + method + resource,
  );
  if (response.$ref)
    response = contract.components.responses[response.$ref.split("/").at(-1)];
  if (status !== 204) {
    const schema = response.content["application/json"].schema;
    const validator = contractValidator.compile({
      ...schema,
      components: contract.components,
    });
    assert.ok(validator(body), JSON.stringify(validator.errors));
  }
}

const dbName = "fluxone_test_" + randomUUID().replaceAll("-", "");
const children = [];
const logs = [];
const base = {
  auth: "http://127.0.0.1:13001",
  payments: "http://127.0.0.1:13002",
  audit: "http://127.0.0.1:13003",
};
let db,
  admin,
  a,
  b,
  c,
  source,
  target,
  other,
  consumer,
  bankServer,
  bankPort,
  workers;
const bankRecords = new Map();
let scenario = "ACCEPTED",
  bankEffects = 0;
const brokerVhost = "test_" + randomUUID().replaceAll("-", "");
async function wait(fn, timeout = 12000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw last ?? Error("Timed out");
}
async function api(service, path, { token, body, key, method = "GET" } = {}) {
  const response = await fetch(base[service] + "/api/v1" + path, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const result = {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
    headers: response.headers,
  };
  checkContract(path, method, result.status, result.body);
  return result;
}
const payment = (value = "10.00", destination = target.code) => ({
  sourceAccountId: source.id,
  destination: { kind: "INTERNAL", code: destination },
  amount: value,
  currency: "COP",
});
before(
  async () => {
    admin = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
    });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    process.env.POSTGRES_DB = dbName;
    const script = (name) =>
      execFileSync(process.execPath, [`tools/${name}.cjs`], {
        env: process.env,
        stdio: "pipe",
      });
    script("init-db");
    script("migrate");
    script("seed");
    db = await database("payments").initialize();
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "rabbitmq",
        "rabbitmqctl",
        "add_vhost",
        brokerVhost,
      ],
      { stdio: "pipe" },
    );
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "rabbitmq",
        "rabbitmqctl",
        "set_permissions",
        "-p",
        brokerVhost,
        process.env.RABBITMQ_USER,
        ".*",
        ".*",
        ".*",
      ],
      { stdio: "pipe" },
    );
    process.env.AMQP_URL =
      process.env.AMQP_URL.replace(/\/$/, "") + "/" + brokerVhost;
    process.env.PAYMENTS_API_URL = "http://127.0.0.1:13002/api/v1";
    for (const [name, port] of [
      ["auth", 13001],
      ["payments", 13002],
      ["audit", 13003],
    ]) {
      const child = spawn(process.execPath, ["tools/run-service.cjs", name], {
        env: { ...process.env, PORT: String(port), WORKERS_ENABLED: "false" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      children.push(child);
      child.stdout.on("data", (x) => logs.push(String(x)));
      child.stderr.on("data", (x) => logs.push(String(x)));
      await wait(() => fetch(base[name] + "/health/ready").then((r) => r.ok));
    }
    a = (
      await api("auth", "/auth/login", {
        method: "POST",
        body: {
          email: process.env.DEMO_A_EMAIL,
          password: process.env.DEMO_A_PASSWORD,
        },
      })
    ).body;
    b = (
      await api("auth", "/auth/login", {
        method: "POST",
        body: {
          email: process.env.DEMO_B_EMAIL,
          password: process.env.DEMO_B_PASSWORD,
        },
      })
    ).body;
    c = (
      await api("auth", "/auth/login", {
        method: "POST",
        body: {
          email: process.env.DEMO_C_EMAIL,
          password: process.env.DEMO_C_PASSWORD,
        },
      })
    ).body;
    assert.ok(a.accessToken);
    assert.ok(b.accessToken);
    assert.ok(c.accessToken);
    const accounts = (
      await api("payments", "/accounts", { token: a.accessToken })
    ).body;
    source = accounts.find((x) => x.code === "ACC-001");
    target = (
      await api("payments", "/accounts", { token: c.accessToken })
    ).body.find((x) => x.code === "ACC-003");
    other = (await api("payments", "/accounts", { token: b.accessToken }))
      .body[0];
    assert.equal(accounts.length, 1, "Demo A owns exactly one demo account");
    assert.equal(
      (await api("payments", "/accounts", { token: c.accessToken })).body
        .length,
      1,
      "Demo C owns exactly one demo account",
    );
  },
  { timeout: 30000 },
);
after(async () => {
  await workers?.stop();
  await consumer?.stop();
  if (bankServer) {
    bankServer.closeAllConnections();
    await new Promise((r) => bankServer.close(r));
  }
  for (const child of children) child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 300));
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGKILL");
  await db?.destroy();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }
  try {
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "rabbitmq",
        "rabbitmqctl",
        "delete_vhost",
        brokerVhost,
      ],
      { stdio: "pipe" },
    );
  } catch {}
});
test("[API-01] Swagger serves contract subsets, bearer auth and UI", async () => {
  for (const [service, tag] of [
    ["auth", "Auth"],
    ["payments", "Payments"],
    ["audit", "Audit"],
  ]) {
    const res = await fetch(base[service] + "/docs-json");
    assert.equal(res.status, 200);
    const doc = await res.json();
    assert.deepEqual(
      Object.keys(doc.paths).sort(),
      Object.keys(serviceDocument(tag).paths).sort(),
    );
    assert.ok(doc.components.securitySchemes.bearerAuth);
    assert.ok(
      Object.values(doc.paths)
        .flatMap(Object.values)
        .every((op) => op.tags.includes(tag)),
    );
    assert.equal((await fetch(base[service] + "/docs")).status, 200);
  }
  assert.ok(!serviceDocument("Auth").components.schemas.Transfer);
});
test("[AUTH-01][AUTH-03][AUTH-04][AUTH-05] registration, duplicate, ownership and bootstrap", async () => {
  assert.equal((await api("payments", "/accounts")).status, 401);
  const email = `${randomUUID()}@test.local`,
    password = "test-password-strong-123";
  assert.equal(
    (
      await api("auth", "/auth/register", {
        method: "POST",
        body: { email, password },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await api("auth", "/auth/register", {
        method: "POST",
        body: { email: email.toUpperCase(), password },
      })
    ).status,
    409,
  );
  const login = await api("auth", "/auth/login", {
    method: "POST",
    body: { email, password },
  });
  const token = login.body.accessToken;
  const one = await api("payments", "/accounts/bootstrap", {
    token,
    method: "POST",
  });
  const two = await api("payments", "/accounts/bootstrap", {
    token,
    method: "POST",
  });
  assert.equal(one.status, 201);
  assert.equal(two.status, 200);
  assert.equal(one.body.id, two.body.id);
  assert.equal(one.body.available, "0.00");
  assert.equal(
    (
      await api("payments", "/transfers", {
        method: "POST",
        token: b.accessToken,
        key: randomUUID(),
        body: payment(),
      })
    ).status,
    404,
  );
});
test("[PAY-01][IDEM-01][IDEM-02][IDEM-03] 20 concurrent requests cause one debit and normalized replay", async () => {
  const key = randomUUID(),
    results = await Promise.all(
      Array.from({ length: 20 }, () =>
        api("payments", "/transfers", {
          token: a.accessToken,
          method: "POST",
          key,
          body: payment("1250.25"),
        }),
      ),
    );
  assert.ok(
    results.every((r) => r.status === 201),
    JSON.stringify(results.map((r) => r.body)),
  );
  assert.equal(new Set(results.map((r) => r.body.id)).size, 1);
  const accounts = (
    await api("payments", "/accounts", { token: a.accessToken })
  ).body;
  assert.equal(accounts.find((x) => x.id === source.id).balance, "998749.75");
  assert.equal(accounts.length, 1);
  assert.equal(
    (await api("payments", "/accounts", { token: c.accessToken })).body.find(
      (x) => x.id === target.id,
    ).balance,
    "1250.25",
  );
  assert.ok(
    (await api("payments", "/transfers", { token: c.accessToken })).body.items
      .some((x) => x.id === results[0].body.id),
    "the internal transfer is visible in the recipient history",
  );
  const conflict = await api("payments", "/transfers", {
    token: a.accessToken,
    method: "POST",
    key,
    body: payment("1250.26"),
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "IDEMPOTENCY_CONFLICT");
  const [row] = await db.query(
    "SELECT count(*) AS n FROM ledger_entries WHERE transfer_id=$1",
    [results[0].body.id],
  );
  assert.equal(Number(row.n), 2);
});
test("[PAY-02][PAY-04][IDEM-04][IDEM-07] validation, headers and durable error replay", async () => {
  assert.equal(
    (
      await api("payments", "/transfers", {
        token: a.accessToken,
        method: "POST",
        body: payment(),
      })
    ).status,
    400,
  );
  for (const amount of ["0", "-1", "1.001"])
    assert.equal(
      (
        await api("payments", "/transfers", {
          token: a.accessToken,
          method: "POST",
          key: randomUUID(),
          body: payment(amount),
        })
      ).status,
      422,
    );
  assert.equal(
    (
      await api("payments", "/transfers", {
        token: a.accessToken,
        method: "POST",
        key: randomUUID(),
        body: payment("1.00", source.code),
      })
    ).status,
    422,
  );
  const key = randomUUID(),
    first = await api("payments", "/transfers", {
      token: a.accessToken,
      method: "POST",
      key,
      body: payment("999999999999.99"),
    }),
    second = await api("payments", "/transfers", {
      token: a.accessToken,
      method: "POST",
      key,
      body: payment("999999999999.99"),
    });
  assert.equal(first.status, 409);
  assert.deepEqual(first.body, second.body);
});
test("[PAY-05] independent concurrent payments cannot overspend", async () => {
  const results = await Promise.all(
    [1, 2].map(() =>
      api("payments", "/transfers", {
        token: b.accessToken,
        method: "POST",
        key: randomUUID(),
        body: {
          sourceAccountId: other.id,
          destination: { kind: "INTERNAL", code: target.code },
          amount: "400000.00",
          currency: "COP",
        },
      }),
    ),
  );
  assert.deepEqual(results.map((x) => x.status).sort(), [201, 409]);
  assert.equal(
    (await api("payments", "/accounts", { token: b.accessToken })).body[0]
      .available,
    "100000.00",
  );
});
test("[REV-01][REV-03][REV-04] concurrent reversals compensate exactly once", async () => {
  const made = await api("payments", "/transfers", {
    token: a.accessToken,
    method: "POST",
    key: randomUUID(),
    body: payment("20.00"),
  });
  assert.equal(made.status, 201);
  const results = await Promise.all(
    [1, 2].map(() =>
      api("payments", `/transfers/${made.body.id}/reversals`, {
        token: a.accessToken,
        method: "POST",
        key: randomUUID(),
      }),
    ),
  );
  assert.deepEqual(results.map((x) => x.status).sort(), [201, 409]);
  assert.equal(
    (
      await api("payments", `/transfers/${made.body.id}`, {
        token: a.accessToken,
      })
    ).body.status,
    "REVERSED",
  );
});
test("[IDEM-05] failure inserting outbox rolls back money and key", async () => {
  const pg = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: dbName,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  });
  await pg.connect();
  const key = randomUUID();
  const before = await api("payments", "/accounts", { token: a.accessToken });
  try {
    await pg.query(
      "CREATE FUNCTION payment_schema.test_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'type'='transfer.completed' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_fail BEFORE INSERT ON payment_schema.outbox_events FOR EACH ROW EXECUTE FUNCTION payment_schema.test_fail_outbox()",
    );
    const failed = await api("payments", "/transfers", {
      token: a.accessToken,
      method: "POST",
      key,
      body: payment("1.00"),
    });
    assert.equal(failed.status, 503);
    assert.deepEqual(
      (await api("payments", "/accounts", { token: a.accessToken })).body,
      before.body,
    );
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) n FROM idempotency_records WHERE key=$1",
            [key],
          )
        )[0].n,
      ),
      0,
    );
  } finally {
    await pg.query(
      "DROP TRIGGER IF EXISTS test_fail ON payment_schema.outbox_events; DROP FUNCTION IF EXISTS payment_schema.test_fail_outbox()",
    );
    await pg.end();
  }
  assert.equal(
    (
      await api("payments", "/transfers", {
        token: a.accessToken,
        method: "POST",
        key,
        body: payment("1.00"),
      })
    ).status,
    201,
  );
});
test("[AUTH-06][AUTH-07] consumed refresh revokes the newly issued family token", async () => {
  const login = await api("auth", "/auth/login", {
    method: "POST",
    body: {
      email: process.env.DEMO_B_EMAIL,
      password: process.env.DEMO_B_PASSWORD,
    },
  });
  const refreshed = await api("auth", "/auth/refresh", {
    method: "POST",
    body: { refreshToken: login.body.refreshToken },
  });
  assert.equal(refreshed.status, 200);
  assert.equal(
    (
      await api("auth", "/auth/refresh", {
        method: "POST",
        body: { refreshToken: login.body.refreshToken },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await api("auth", "/auth/refresh", {
        method: "POST",
        body: { refreshToken: refreshed.body.refreshToken },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await api("auth", "/auth/logout", {
        method: "POST",
        body: { refreshToken: refreshed.body.refreshToken },
      })
    ).status,
    204,
  );
});
test("[AUD-08] runtime roles cannot query another schema", async () => {
  for (const name of ["auth", "audit"]) {
    const connection = await database(name).initialize();
    try {
      await assert.rejects(
        connection.query("SELECT * FROM payment_schema.accounts"),
        (e) => e.code === "42501",
      );
    } finally {
      await connection.destroy();
    }
  }
  await assert.rejects(
    db.query("SELECT * FROM auth_schema.users"),
    (e) => e.code === "42501",
  );
});
test(
  "[RAIL-01][RAIL-02][RAIL-03][RAIL-04][RAIL-05][REV-05] adapter/worker handles bank outcomes, reservation and external reversal",
  async () => {
    bankServer = http.createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET") {
        const original = bankRecords.get(req.url.split("/").at(-1));
        res.statusCode = original ? 200 : 404;
        res.end(
          JSON.stringify(
            original ?? { code: "REFERENCE_NOT_FOUND", message: "Not found" },
          ),
        );
        return;
      }
      const parts = [];
      for await (const part of req) parts.push(part);
      const body = JSON.parse(Buffer.concat(parts).toString());
      const old = bankRecords.get(body.reference);
      if (old) {
        res.statusCode = old.status === "ACCEPTED" ? 200 : 422;
        res.end(JSON.stringify(old));
        return;
      }
      if (scenario === "UNAVAILABLE") {
        res.statusCode = 503;
        res.end(
          JSON.stringify({ code: "RAIL_UNAVAILABLE", message: "Unavailable" }),
        );
        return;
      }
      if (scenario === "TIMEOUT_NOT_PROCESSED") {
        await new Promise((r) => setTimeout(r, 12000));
        res.statusCode = 503;
        res.end(
          JSON.stringify({ code: "RAIL_UNAVAILABLE", message: "Unavailable" }),
        );
        return;
      }
      const status = scenario === "REJECTED" ? "REJECTED" : "ACCEPTED";
      const value = {
        ...body,
        status,
        reason: null,
        processedAt: new Date().toISOString(),
        ...(body.originalReference ? {} : { reversal: null }),
      };
      bankRecords.set(body.reference, value);
      if (status === "ACCEPTED") bankEffects++;
      if (body.originalReference)
        bankRecords.get(body.originalReference).reversal = value;
      if (scenario === "TIMEOUT_PROCESSED")
        await new Promise((r) => setTimeout(r, 12000));
      res.statusCode = status === "ACCEPTED" ? 200 : 422;
      res.end(JSON.stringify(value));
    });
    bankServer.listen(0, "127.0.0.1");
    await once(bankServer, "listening");
    bankPort = bankServer.address().port;
    process.env.RAIL_API_URL = `http://127.0.0.1:${bankPort}`;
    const {
      PaymentWorkers,
    } = require("../apps/payments/dist/infrastructure/workers");
    const { HttpBank } = require("../apps/payments/dist/infrastructure/bank");
    workers = new PaymentWorkers(db, new HttpBank());
    const create = () =>
      api("payments", "/transfers", {
        token: a.accessToken,
        method: "POST",
        key: randomUUID(),
        body: {
          ...payment("1.00"),
          destination: { kind: "EXTERNAL", code: "EXT-001" },
        },
      });
    const made = await create();
    assert.equal(made.status, 202);
    assert.equal(
      (await api("payments", "/accounts", { token: a.accessToken })).body.find(
        (x) => x.id === source.id,
      ).reserved,
      "1.00",
    );
    await workers.bankOne(false);
    assert.equal(
      (
        await api("payments", `/transfers/${made.body.id}`, {
          token: a.accessToken,
        })
      ).body.status,
      "COMPLETED",
    );
    const reverse = await api(
      "payments",
      `/transfers/${made.body.id}/reversals`,
      { token: a.accessToken, method: "POST", key: randomUUID() },
    );
    assert.equal(reverse.status, 202);
    await workers.bankOne(true);
    assert.equal(
      (
        await api("payments", `/transfers/${made.body.id}`, {
          token: a.accessToken,
        })
      ).body.status,
      "REVERSED",
    );
    scenario = "REJECTED";
    const rejected = await create();
    await workers.bankOne(false);
    assert.equal(
      (
        await api("payments", `/transfers/${rejected.body.id}`, {
          token: a.accessToken,
        })
      ).body.status,
      "FAILED",
    );
    scenario = "UNAVAILABLE";
    const unavailable = await create();
    await workers.bankOne(false);
    assert.equal(
      (
        await api("payments", `/transfers/${unavailable.body.id}`, {
          token: a.accessToken,
        })
      ).body.status,
      "PENDING",
    );
    await db.query("UPDATE transfers SET next_attempt_at=now() WHERE id=$1", [
      unavailable.body.id,
    ]);
    scenario = "ACCEPTED";
    await workers.bankOne(false);
    assert.equal(
      (
        await api("payments", `/transfers/${unavailable.body.id}`, {
          token: a.accessToken,
        })
      ).body.status,
      "COMPLETED",
    );
    scenario = "TIMEOUT_PROCESSED";
    const uncertain = await create(),
      effectsBefore = bankEffects;
    await workers.bankOne(false);
    assert.equal(
      (
        await api("payments", `/transfers/${uncertain.body.id}`, {
          token: a.accessToken,
        })
      ).body.status,
      "UNKNOWN",
    );
    await db.query("UPDATE transfers SET next_attempt_at=now() WHERE id=$1", [
      uncertain.body.id,
    ]);
    await workers.bankOne(false);
    assert.equal(
      (
        await api("payments", `/transfers/${uncertain.body.id}`, {
          token: a.accessToken,
        })
      ).body.status,
      "COMPLETED",
    );
    assert.equal(bankEffects, effectsBefore + 1);
    scenario = "TIMEOUT_NOT_PROCESSED";
    const absent = await create();
    await workers.bankOne(false);
    assert.equal(
      (
        await api("payments", `/transfers/${absent.body.id}`, {
          token: a.accessToken,
        })
      ).body.status,
      "UNKNOWN",
    );
    scenario = "ACCEPTED";
    await db.query("UPDATE transfers SET next_attempt_at=now() WHERE id=$1", [
      absent.body.id,
    ]);
    await workers.bankOne(false);
    assert.equal(
      (
        await api("payments", `/transfers/${absent.body.id}`, {
          token: a.accessToken,
        })
      ).body.status,
      "COMPLETED",
    );
    assert.equal(
      (await api("payments", "/accounts", { token: a.accessToken })).body.find(
        (x) => x.id === source.id,
      ).reserved,
      "0.00",
    );
  },
  { timeout: 40000 },
);
test(
  "[AUD-01][AUD-03][AUD-04] real RabbitMQ outbox delivery, duplicate consumption and identity conflict",
  async () => {
    const { PgAuditStore } = require("../apps/audit/dist/infrastructure/store"),
      { AuditConsumer } = require("../apps/audit/dist/infrastructure/consumer");
    const auditDb = await database("audit").initialize();
    const store = new PgAuditStore(auditDb);
    consumer = new AuditConsumer(store);
    consumer.start();
    await wait(() => consumer.ready);
    const row = (
      await db.query(
        "SELECT payload FROM outbox_events ORDER BY sequence LIMIT 1",
      )
    )[0];
    await store.persist(row.payload);
    await store.persist(JSON.parse(JSON.stringify(row.payload)));
    await assert.rejects(
      store.persist({ ...row.payload, type: "transfer.failed" }),
    );
    workers.start();
    await wait(
      async () =>
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM outbox_events WHERE published_at IS NULL",
            )
          )[0].n,
        ) === 0,
    );
    await wait(
      async () =>
        Number(
          (await auditDb.query("SELECT count(*) n FROM audit_events"))[0].n,
        ) ===
        Number((await db.query("SELECT count(*) n FROM outbox_events"))[0].n),
    );
    await workers.stop();
    await consumer.stop();
    const view = await api(
      "audit",
      `/transfers/${row.payload.transferId}/audit`,
      { token: a.accessToken },
    );
    assert.equal(view.status, 200);
    assert.ok(view.body.items.length);
    assert.equal(
      (
        await api("audit", `/transfers/${row.payload.transferId}/audit`, {
          token: b.accessToken,
        })
      ).status,
      404,
    );
    await auditDb.destroy();
  },
  { timeout: 20000 },
);

test("[PAY-08] cursor pagination and filter binding", async () => {
  const first = await api("payments", "/transfers?limit=2", {
    token: a.accessToken,
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 2);
  assert.ok(first.body.nextCursor);
  const second = await api(
    "payments",
    "/transfers?limit=2&cursor=" + encodeURIComponent(first.body.nextCursor),
    { token: a.accessToken },
  );
  assert.equal(second.status, 200);
  assert.ok(
    second.body.items.every(
      (x) => !first.body.items.some((y) => x.id === y.id),
    ),
  );
  assert.equal(
    (
      await api(
        "payments",
        "/transfers?status=COMPLETED&cursor=" +
          encodeURIComponent(first.body.nextCursor),
        { token: a.accessToken },
      )
    ).status,
    422,
  );
});
