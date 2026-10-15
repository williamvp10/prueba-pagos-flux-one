require("./load-env.cjs");
const { database } = require("../packages/backend-kit");
const services = {
  auth: [
    "../apps/auth/dist/infrastructure/store",
    "AuthMigration1792073600000",
  ],
  payments: [
    "../apps/payments/dist/infrastructure/store",
    ["PaymentsMigration1792073600001", "PaymentLinksMigration1792073600002"],
  ],
  audit: [
    "../apps/audit/dist/infrastructure/store",
    "AuditMigration1792073600002",
  ],
};
(async () => {
  for (const name of process.argv[2]
    ? [process.argv[2]]
    : Object.keys(services)) {
    const [file, keys] = services[name];
    const migrationKeys = Array.isArray(keys) ? keys : [keys];
    const migrations = migrationKeys.map((key) => require(file)[key]);
    const db = database(name, migrations, true);
    await db.initialize();
    try {
      await db.runMigrations({ transaction: "all" });
      console.log(`Migraciones ${name}: OK`);
    } finally {
      await db.destroy();
    }
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
