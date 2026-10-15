# Decisiones de arquitectura

Estado: aceptadas para v1 por decisiones explícitas del usuario o defaults documentados. Cambios futuros deben actualizar spec y contratos antes del código.

| ID | Decisión | Motivo y consecuencia |
|---|---|---|
| ADR-001 | pnpm monorepo, tres apps NestJS hexagonales y Next.js | Un repo simplifica entrega; procesos/datos siguen separados. No compartir dominio entre servicios. |
| ADR-002 | RabbitMQ + transactional outbox | Auditoría asíncrona sin perder cambios cuando broker cae. Entrega al menos una vez exige deduplicación; no Kafka porque no hay necesidad de streams/replay masivo. |
| ADR-003 | PostgreSQL, esquema y rol por servicio | Cumplir aislamiento sin operar tres instancias. auth_schema es supuesto adicional explícito; sin joins/FKs cruzados. |
| ADR-004 | bigint centavos + strings decimales API | Evita floats. Límite monetario explícito y mapeo DTO/domain/DB obligatorio. |
| ADR-005 | Reserva durable y conciliación externa | Timeout no autoriza devolver dinero. Lease/consulta/idempotencia bancaria permiten recuperación, a costa de fondos temporalmente retenidos. |
| ADR-006 | Idempotencia persistente con unicidad y snapshot | Concurrencia se resuelve en DB; replay devuelve resultado original. Errores definitivos de negocio consumen key. |
| ADR-007 | Mock propio persistente, tres endpoints | Aclaración del evaluador permite bodies propios. GET incluye reverso y evita endpoint adicional. SQLite persiste solo resultados del simulador. |
| ADR-008 | OpenAPI primero y eventos JSON Schema | Tipos generados reducen divergencia frontend/backend; compatibilidad también requiere tests de proveedor. |
| ADR-009 | BFF Next.js y cookies HttpOnly | Browser no almacena tokens en JS. Añade traducción auth, Origin check y coordinación de refresh. |
| ADR-010 | Audit consulta autorización en payments | Evita duplicar ownership en otra DB. Consulta falla cerrado ante caída de payments; disponibilidad menor es tradeoff v1. |
| ADR-011 | Bootstrap explícito de cuenta tras login | No transacción distribuida auth/pagos. Reintento idempotente por propietario sin volver a registrar usuario. |
| ADR-012 | Un .env raíz, variables limitadas por servicio | Cumple Dokploy y evita compartir todos los secretos con cada contenedor. Override solo para entrada Traefik. |
| ADR-013 | Polling y shadcn con tema azul | Complejidad menor que SSE, claridad de pending/unknown; temas accesibles y componentes estándar. |
| ADR-014 | TypeORM DataSource/EntityManager y SQL explícito en adapters | Mantiene SQL de locks/constraints/migrations visible y dominio sin entities ORM. UnitOfWork usa un único manager; imports de TypeORM se limitan a infraestructura/bootstrap. |

## Alternativas descartadas para v1

Kafka, event sourcing completo, transacciones distribuidas entre servicios, JWT en localStorage, balances float y confirmación optimista del banco. No agregar Redis, Kubernetes, gateway separado ni proveedor de email sin una necesidad que justifique su operación dentro de la prueba.
