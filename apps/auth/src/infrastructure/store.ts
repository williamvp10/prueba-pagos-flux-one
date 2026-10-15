import { DataSource, MigrationInterface, QueryRunner } from "typeorm";
import {
  randomUUID,
  randomBytes,
  createHash,
  scrypt as rawScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import * as jwt from "jsonwebtoken";
import { env } from "@fluxone/backend-kit";
import {
  IdentityStore,
  Identity,
  AuthFault,
  PasswordHasher,
  TokenIssuer,
} from "../domain/ports";
const scrypt = promisify(rawScrypt);
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const identity = (r: any): Identity => ({
  id: r.id,
  email: r.email,
  passwordHash: r.password_hash,
  createdAt: new Date(r.created_at).toISOString(),
});
export class AuthMigration1792073600000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TABLE users(id uuid PRIMARY KEY,email text NOT NULL UNIQUE,password_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE sessions(id uuid PRIMARY KEY,family uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id),token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,revoked_at timestamptz,rotated_to uuid); CREATE INDEX sessions_family ON sessions(family);`,
    );
  }
  async down(q: QueryRunner) {
    await q.query("DROP TABLE sessions;DROP TABLE users");
  }
}
export class ScryptPasswords implements PasswordHasher {
  async hash(password: string) {
    const salt = randomBytes(16).toString("hex");
    return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString("hex")}`;
  }
  async verify(password: string, hash: string) {
    const [salt, key] = hash.split(":");
    if (!salt || !key) return false;
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    const stored = Buffer.from(key, "hex");
    return stored.length === derived.length && timingSafeEqual(stored, derived);
  }
}
export class JwtIssuer implements TokenIssuer {
  issue(id: string) {
    return jwt.sign(
      {},
      Buffer.from(env("JWT_PRIVATE_KEY_B64"), "base64").toString(),
      {
        algorithm: "RS256",
        subject: id,
        issuer: env("JWT_ISSUER", "fluxone-auth"),
        audience: env("JWT_AUDIENCE", "fluxone"),
        expiresIn: 900,
      },
    );
  }
}
export class PgIdentityStore implements IdentityStore {
  constructor(private db: DataSource) {}
  async register(email: string, passwordHash: string) {
    try {
      const [r] = await this.db.query(
        "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3) RETURNING *",
        [randomUUID(), email, passwordHash],
      );
      return identity(r);
    } catch (e: any) {
      if (e.code === "23505") throw new AuthFault(409, "EMAIL_TAKEN");
      throw e;
    }
  }
  async find(email: string) {
    const [r] = await this.db.query("SELECT * FROM users WHERE email=$1", [
      email,
    ]);
    return r ? identity(r) : null;
  }
  async findId(id: string) {
    const [r] = await this.db.query("SELECT * FROM users WHERE id=$1", [id]);
    return r ? identity(r) : null;
  }
  async session(userId: string) {
    const token = randomBytes(48).toString("base64url");
    await this.db.query(
      "INSERT INTO sessions(id,family,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days')",
      [randomUUID(), randomUUID(), userId, digest(token)],
    );
    return token;
  }
  async rotate(token: string) {
    return this.db.transaction(async (m) => {
      // The user row is the family serialization point, including newly issued tokens.
      const [found] = await m.query(
        "SELECT user_id FROM sessions WHERE token_hash=$1",
        [digest(token)],
      );
      if (!found) return null;
      await m.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        found.user_id,
      ]);
      const [old] = await m.query(
        "SELECT * FROM sessions WHERE token_hash=$1 FOR UPDATE",
        [digest(token)],
      );
      if (!old) return null;
      if (old.revoked_at || new Date(old.expires_at).getTime() <= Date.now()) {
        await m.query(
          "UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE family=$1",
          [old.family],
        );
        return null;
      }
      const next = randomBytes(48).toString("base64url"),
        id = randomUUID();
      await m.query(
        "UPDATE sessions SET revoked_at=now(),rotated_to=$2 WHERE id=$1",
        [old.id, id],
      );
      await m.query(
        "INSERT INTO sessions(id,family,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days')",
        [id, old.family, old.user_id, digest(next)],
      );
      const [u] = await m.query("SELECT * FROM users WHERE id=$1", [
        old.user_id,
      ]);
      return { user: identity(u), refresh: next };
    });
  }
  async revoke(token: string) {
    await this.db.transaction(async (m) => {
      const [row] = await m.query(
        "SELECT user_id,family FROM sessions WHERE token_hash=$1",
        [digest(token)],
      );
      if (!row) return;
      await m.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        row.user_id,
      ]);
      await m.query(
        "UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE family=$1",
        [row.family],
      );
    });
  }
}
