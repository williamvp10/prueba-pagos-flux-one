import {
  Module,
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  database,
  HealthController,
  JwtGuard,
  launch,
} from "@fluxone/backend-kit";
import { Payments } from "../application/payments";
import { PgQueries, PgUnitOfWork, ids } from "../infrastructure/store";
import { PaymentsController } from "../infrastructure/http";
import { PaymentWorkers } from "../infrastructure/workers";
import { HttpBank } from "../infrastructure/bank";
@Injectable()
class Lifecycle implements OnModuleInit, OnModuleDestroy {
  private workers: PaymentWorkers;
  constructor(@Inject(DataSource) db: DataSource) {
    this.workers = new PaymentWorkers(db, new HttpBank());
  }
  onModuleInit() {
    if (process.env.WORKERS_ENABLED !== "false") this.workers.start();
  }
  async onModuleDestroy() {
    await this.workers.stop();
  }
}
@Module({
  controllers: [PaymentsController, HealthController],
  providers: [
    JwtGuard,
    Lifecycle,
    {
      provide: DataSource,
      useFactory: () => database("payments").initialize(),
    },
    {
      provide: Payments,
      inject: [DataSource],
      useFactory: (db: DataSource) => new Payments(new PgUnitOfWork(db), ids),
    },
    {
      provide: PgQueries,
      inject: [DataSource],
      useFactory: (db: DataSource) => new PgQueries(db),
    },
  ],
})
class PaymentsModule {}
if (require.main === module)
  launch(PaymentsModule, "Payments", 3002).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
export { PaymentsModule };
