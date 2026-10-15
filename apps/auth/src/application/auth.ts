import {
  IdentityStore,
  PasswordHasher,
  TokenIssuer,
  AuthFault,
  Identity,
} from "../domain/ports";
export class AuthUseCases {
  constructor(
    private store: IdentityStore,
    private passwords: PasswordHasher,
    private issuer: TokenIssuer,
  ) {}
  user(u: Identity) {
    return { id: u.id, email: u.email, createdAt: u.createdAt };
  }
  async register(email: string, password: string) {
    return this.user(
      await this.store.register(
        email.trim().toLowerCase(),
        await this.passwords.hash(password),
      ),
    );
  }
  async login(email: string, password: string) {
    const u = await this.store.find(email.trim().toLowerCase());
    const valid = await this.passwords.verify(
      password,
      u?.passwordHash ??
        (await this.passwords.hash("non-user-placeholder-password")),
    );
    if (!u || !valid) throw new AuthFault(401, "UNAUTHORIZED");
    return this.tokens(u, await this.store.session(u.id));
  }
  async refresh(token: string) {
    const next = await this.store.rotate(token);
    if (!next) throw new AuthFault(401, "UNAUTHORIZED");
    return this.tokens(next.user, next.refresh);
  }
  async logout(token: string) {
    await this.store.revoke(token);
  }
  async me(id: string) {
    const u = await this.store.findId(id);
    if (!u) throw new AuthFault(401, "UNAUTHORIZED");
    return this.user(u);
  }
  private tokens(u: Identity, refresh: string) {
    return {
      user: this.user(u),
      accessToken: this.issuer.issue(u.id),
      refreshToken: refresh,
      tokenType: "Bearer",
      expiresIn: 900,
    };
  }
}
