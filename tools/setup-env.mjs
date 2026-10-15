import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID, generateKeyPairSync } from "node:crypto";
const secret = () => randomBytes(24).toString("hex");
if (existsSync(".env")) {
  let content = readFileSync(".env", "utf8");
  const additions = {
    PAYMENT_LINK_SIGNING_SECRET: randomBytes(32).toString("base64url"),
    DEMO_C_ID: randomUUID(),
    DEMO_C_EMAIL: "demo.c@fluxone.local",
    DEMO_C_PASSWORD: secret(),
  };
  const updates = Object.entries(additions).filter(([key]) => {
    const current = content.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1];
    return current === undefined || (key === "PAYMENT_LINK_SIGNING_SECRET" && current === "GENERATE_WITH_SETUP");
  });
  for (const [key, value] of updates) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    content = pattern.test(content)
      ? content.replace(pattern, `${key}=${value}`)
      : `${content}\n${key}=${value}`;
  }
  if (updates.length) writeFileSync(".env", content + "\n", { mode: 0o600 });
  console.log(
    updates.length
      ? "Se completó la configuración nueva en el .env existente; los secretos previos se conservaron"
      : ".env ya incluye Demo C; no se modificó",
  );
  process.exit(0);
}
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
let content = readFileSync(".env.example", "utf8");
const generated = {
  POSTGRES_PASSWORD: secret(),
  AUTH_DB_PASSWORD: secret(),
  PAYMENTS_DB_PASSWORD: secret(),
  AUDIT_DB_PASSWORD: secret(),
  AUTH_MIGRATION_PASSWORD: secret(),
  PAYMENTS_MIGRATION_PASSWORD: secret(),
  AUDIT_MIGRATION_PASSWORD: secret(),
  RABBITMQ_PASSWORD: secret(),
  JWT_PRIVATE_KEY_B64: Buffer.from(privateKey).toString("base64"),
  JWT_PUBLIC_KEY_B64: Buffer.from(publicKey).toString("base64"),
  DEMO_A_ID: randomUUID(),
  DEMO_B_ID: randomUUID(),
  DEMO_C_ID: randomUUID(),
  DEMO_A_PASSWORD: secret(),
  DEMO_B_PASSWORD: secret(),
  DEMO_C_PASSWORD: secret(),
  PAYMENT_LINK_SIGNING_SECRET: randomBytes(32).toString("base64url"),
};
for (const [key, value] of Object.entries(generated))
  content = content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
writeFileSync(".env", content, { mode: 0o600 });
console.log(
  ".env creado con secretos nuevos; consultar credenciales demo localmente, sin publicarlas",
);
