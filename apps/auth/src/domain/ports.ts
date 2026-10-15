export type Identity = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};
export class AuthFault extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export interface IdentityStore {
  register(email: string, passwordHash: string): Promise<Identity>;
  find(email: string): Promise<Identity | null>;
  findId(id: string): Promise<Identity | null>;
  session(userId: string): Promise<string>;
  rotate(refresh: string): Promise<{ user: Identity; refresh: string } | null>;
  revoke(refresh: string): Promise<void>;
}
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}
export interface TokenIssuer {
  issue(userId: string): string;
}
