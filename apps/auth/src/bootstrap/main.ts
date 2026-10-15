import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  database,
  HealthController,
  JwtGuard,
  launch,
} from "@fluxone/backend-kit";
import { AuthUseCases } from "../application/auth";
import {
  PgIdentityStore,
  ScryptPasswords,
  JwtIssuer,
} from "../infrastructure/store";
import { AuthController } from "../infrastructure/http";
@Module({
  controllers: [AuthController, HealthController],
  providers: [
    JwtGuard,
    { provide: DataSource, useFactory: () => database("auth").initialize() },
    {
      provide: AuthUseCases,
      inject: [DataSource],
      useFactory: (db: DataSource) =>
        new AuthUseCases(
          new PgIdentityStore(db),
          new ScryptPasswords(),
          new JwtIssuer(),
        ),
    },
  ],
})
class AuthModule {}
if (require.main === module)
  launch(AuthModule, "Auth", 3001).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
export { AuthModule };
