import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID, generateKeyPairSync } from "node:crypto";
if (existsSync(".env")) {
  console.log(".env ya existe; no se modificó");
  process.exit(0);
}
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const secret = () => randomBytes(24).toString("hex");
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
  DEMO_A_PASSWORD: secret(),
  DEMO_B_PASSWORD: secret(),
};
for (const [key, value] of Object.entries(generated))
  content = content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
writeFileSync(".env", content, { mode: 0o600 });
console.log(
  ".env creado con secretos nuevos; consultar credenciales demo localmente, sin publicarlas",
);
