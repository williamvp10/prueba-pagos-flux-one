import {
  Module,
  Inject,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { database, JwtGuard, launch } from "@fluxone/backend-kit";
import { ReadAudit } from "../application/audit";
import { PgAuditStore, PaymentsAccess } from "../infrastructure/store";
import { AuditConsumer } from "../infrastructure/consumer";
import { AuditController, AuditHealth } from "../infrastructure/http";
@Injectable()
class Lifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(AuditConsumer) private consumer: AuditConsumer) {}
  onModuleInit() {
    this.consumer.start();
  }
  async onModuleDestroy() {
    await this.consumer.stop();
  }
}
@Module({
  controllers: [AuditController, AuditHealth],
  providers: [
    JwtGuard,
    Lifecycle,
    { provide: DataSource, useFactory: () => database("audit").initialize() },
    {
      provide: PgAuditStore,
      inject: [DataSource],
      useFactory: (db: DataSource) => new PgAuditStore(db),
    },
    {
      provide: AuditConsumer,
      inject: [PgAuditStore],
      useFactory: (store: PgAuditStore) => new AuditConsumer(store),
    },
    {
      provide: ReadAudit,
      inject: [PgAuditStore],
      useFactory: (store: PgAuditStore) =>
        new ReadAudit(store, new PaymentsAccess()),
    },
  ],
})
class AuditModule {}
if (require.main === module)
  launch(AuditModule, "Audit", 3003).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
export { AuditModule };
