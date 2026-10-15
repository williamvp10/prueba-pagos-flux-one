require("./load-env.cjs");
const { database } = require("../packages/backend-kit");
const { ScryptPasswords } = require("../apps/auth/dist/infrastructure/store");
const { randomUUID } = require("node:crypto");
(async () => {
  const auth = await database("auth").initialize();
  try {
    const hasher = new ScryptPasswords();
    for (const user of ["A", "B", "C"]) {
      await auth.query(
        "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [
          process.env[`DEMO_${user}_ID`],
          process.env[`DEMO_${user}_EMAIL`],
          await hasher.hash(process.env[`DEMO_${user}_PASSWORD`]),
        ],
      );
    }
  } finally {
    await auth.destroy();
  }
  const payments = await database("payments").initialize();
  try {
    // ACC-003 used to be Demo A's secondary account. Move only that known seed
    // to the new demo identity; preserve its balance and historical ledger.
    await payments.query(
      "UPDATE accounts SET owner_id=$1,role='PRIMARY' WHERE code='ACC-003' AND owner_id=$2 AND role='SECONDARY'",
      [process.env.DEMO_C_ID, process.env.DEMO_A_ID],
    );
    for (const [code, owner, balance, role] of [
      ["ACC-001", process.env.DEMO_A_ID, "100000000", "PRIMARY"],
      ["ACC-002", process.env.DEMO_B_ID, "50000000", "PRIMARY"],
      ["ACC-003", process.env.DEMO_C_ID, "0", "PRIMARY"],
    ]) {
      await payments.transaction(async (m) => {
        const rows = await m.query(
          "INSERT INTO accounts(id,code,owner_id,balance_minor,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id",
          [randomUUID(), code, owner, balance, role],
        );
        if (rows.length && BigInt(balance) > 0n)
          await m.query(
            "INSERT INTO ledger_entries(id,operation_key,account_id,direction,amount_minor) VALUES($1,$2,$3,'CREDIT',$4) ON CONFLICT DO NOTHING",
            [randomUUID(), `seed:${code}`, rows[0].id, balance],
          );
      });
    }
    console.log("Seeds idempotentes aplicados sin resetear datos");
  } finally {
    await payments.destroy();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
