require("./load-env.cjs");
const { Client } = require("../packages/backend-kit/node_modules/pg");
const ident = (value) => '"' + String(value).replaceAll('"', '""') + '"',
  literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
(async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  });
  await client.connect();
  try {
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    for (const service of ["AUTH", "PAYMENTS", "AUDIT"]) {
      const schema =
        service === "PAYMENTS"
          ? "payment_schema"
          : `${service.toLowerCase()}_schema`;
      const app = process.env[`${service}_DB_USER`],
        migration = process.env[`${service}_MIGRATION_USER`];
      for (const [role, password] of [
        [app, process.env[`${service}_DB_PASSWORD`]],
        [migration, process.env[`${service}_MIGRATION_PASSWORD`]],
      ]) {
        if (!role || !password || password === "GENERATE_WITH_SETUP")
          throw Error("Run setup first");
        const found = await client.query(
          "SELECT 1 FROM pg_roles WHERE rolname=$1",
          [role],
        );
        if (!found.rows.length)
          await client.query(
            `CREATE ROLE ${ident(role)} LOGIN PASSWORD ${literal(password)}`,
          );
        await client.query(
          `ALTER ROLE ${ident(role)} SET search_path TO ${ident(schema)}`,
        );
      }
      await client.query(
        `CREATE SCHEMA IF NOT EXISTS ${ident(schema)} AUTHORIZATION ${ident(migration)}`,
      );
      await client.query(`REVOKE ALL ON SCHEMA ${ident(schema)} FROM PUBLIC`);
      await client.query(
        `GRANT USAGE ON SCHEMA ${ident(schema)} TO ${ident(app)}`,
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(migration)} IN SCHEMA ${ident(schema)} GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${ident(app)}`,
      );
      await client.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${ident(schema)} TO ${ident(app)}`,
      );
    }
    console.log("Schemas y roles aislados inicializados");
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
