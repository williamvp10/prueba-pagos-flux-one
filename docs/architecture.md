# Arquitectura hexagonal

## Servicios y responsabilidad

| Proceso | Responsabilidad | Datos exclusivos | Entradas/salidas |
|---|---|---|---|
| web | UI, sesión browser, proxy HTTP del mismo origen | cookies HttpOnly; sin tablas | browser ↔ Next.js ↔ APIs |
| auth | usuarios, passwords, sesiones/rotación | auth_schema | REST; emite JWT RS256 |
| payments | cuentas, transferencias, reversos, ledger, idempotencia y outbox | payment_schema | REST, HTTP rail, AMQP |
| audit | consumo deduplicado y consultas autorizadas | audit_schema | AMQP y REST; consulta autorización en payments |
| rail-mock | simular banco, deduplicar referencias y responder fallos | SQLite en volumen exclusivo | solo HTTP interno |
| PostgreSQL | persistencia transaccional | tres esquemas/roles sin acceso cruzado | red privada |
| RabbitMQ | transporte durable de eventos | volumen del broker | AMQP interno |

El mock es un servicio de soporte; no reemplaza ninguno de los tres microservicios requeridos. Workers de conciliación y outbox viven en payments para limitar complejidad. Tener varias réplicas exige claims/leases en DB, sin coordinación en memoria.

## Contenedores y flujo

```mermaid
flowchart LR
    User[Usuario] -->|HTTPS| Web[Next.js y shadcn]
    Web -->|HTTP privado| Auth[Auth NestJS]
    Web -->|HTTP privado con JWT| Pay[Payments NestJS]
    Web -->|HTTP privado con JWT| Audit[Audit NestJS]
    Auth --> AuthDB[(auth_schema)]
    Pay --> PayDB[(payment_schema)]
    Pay -->|HTTP con referencia estable| Rail[Riel mock]
    Rail --> RailDB[(SQLite persistente)]
    Pay -->|Outbox y publisher confirms| MQ[RabbitMQ]
    MQ -->|Consumo con ack| Audit
    Audit --> AuditDB[(audit_schema)]
    Audit -->|GET transferencia con JWT del usuario| Pay
```

Audit obtiene autorización consultando `GET /api/v1/transfers/{id}` en payments con el JWT original. Si payments no está disponible, falla cerrado con 503; si no hay acceso devuelve 404. No lee payment_schema ni confía solo en un ID recibido del browser. La consulta no produce eventos de dominio y evita un bucle de auditoría.

## Capas por microservicio

```mermaid
flowchart TB
    HTTP[Controller HTTP] --> UseCase[Casos de uso application]
    Worker[Workers y consumidor AMQP] --> UseCase
    UseCase --> Domain[Dominio puro]
    UseCase --> Ports[Puertos de salida]
    DB[Adapter TypeORM] -. implementa .-> Ports
    Bank[Adapter HTTP del riel] -. implementa .-> Ports
    Queue[Adapter RabbitMQ] -. implementa .-> Ports
    Root[Composition root NestJS] --> HTTP
    Root --> UseCase
    Root --> DB
    Root --> Bank
    Root --> Queue
```

Las flechas sólidas representan dependencias. Infrastructure depende de application/domain; domain no conoce infraestructura. Puertos de payments: AccountsRepository, TransfersRepository, ReversalsRepository, IdempotencyStore, UnitOfWork, BankRail, OutboxStore, Clock e IdGenerator. El publicador consume outbox; no lo invocan transacciones de negocio.

```text
apps/
  auth/src/{domain,application,infrastructure,bootstrap}/
  payments/src/{domain,application,infrastructure,bootstrap}/
  audit/src/{domain,application,infrastructure,bootstrap}/
  rail-mock/src/
  web/src/
packages/
  api-client/        # generado de OpenAPI, sin entidades de negocio
  event-contracts/   # schemas versionados, sin adapters
infra/              # init PostgreSQL y Dockerfiles cuando se implemente
docs/
```

DTO HTTP y entities TypeORM se mapean al dominio. UnitOfWork entrega repositorios asociados al mismo EntityManager transaccional: usar un repository global dentro del callback rompería atomicidad.

## Transferencia externa y respuesta desconocida

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant P as Payments
    participant DB as PostgreSQL pagos
    participant R as Rail mock
    UI->>P: POST transferencia + Idempotency-Key
    P->>DB: TX: claim key, reserva, transferencia y outbox
    DB-->>P: commit
    P-->>UI: 202 + transferencia PENDING
    P->>DB: Claim durable del trabajo
    P->>R: POST con referencia estable
    alt ACCEPTED
        R-->>P: 200 ACCEPTED
        P->>DB: TX: consumir reserva, ledger, COMPLETED y outbox
    else REJECTED
        R-->>P: 422 REJECTED
        P->>DB: TX: liberar reserva, FAILED y outbox
    else Timeout o respuesta ambigua
        P->>DB: TX: UNKNOWN y outbox
        P->>R: GET por referencia
        R-->>P: Resultado o 404
        P->>DB: TX: aplicar resultado confirmado
        Note over P,R: Ante 404 reenviar misma referencia, nunca asumir rechazo
    end
```

## Máquina de estados

```mermaid
stateDiagram-v2
    [*] --> PENDING: externa aceptada localmente
    PENDING --> PROCESSING: worker reclama trabajo
    PROCESSING --> COMPLETED: banco acepta
    PROCESSING --> FAILED: banco rechaza
    PROCESSING --> UNKNOWN: timeout o respuesta inválida
    PROCESSING --> PENDING: 503 sin procesamiento
    UNKNOWN --> COMPLETED: consulta confirma aceptación
    UNKNOWN --> FAILED: consulta confirma rechazo
    UNKNOWN --> PROCESSING: 404 y reenvío con misma referencia
    [*] --> COMPLETED: interna atómica
    COMPLETED --> REVERSED: reverso confirmado
    FAILED --> [*]
    REVERSED --> [*]
```

Un reverso tiene máquina independiente PENDING → PROCESSING → COMPLETED/FAILED/UNKNOWN; PROCESSING → PENDING ante 503; UNKNOWN → PROCESSING/COMPLETED/FAILED. La transferencia permanece COMPLETED mientras el reverso no esté confirmado. El body incluye `reversal` para distinguir solicitud pendiente, fallida o exitosa.

## Garantías y límites

- Atomicidad local de saldos/ledger/estado/outbox; entrega de eventos al menos una vez y deduplicación en destino.
- Progreso eventual cuando DB, broker y banco se recuperan. No prometer finalización acotada durante fallos persistentes.
- Reinicios de workers recuperan leases expirados. Después de una llamada ambigua se consulta antes de reenviar.
- La demo en una VPS no es alta disponibilidad. Volúmenes no sustituyen backups.
- Consultas autorizadas a audit tienen dependencia de disponibilidad de payments; es un tradeoff explícito para evitar replicar ACL en v1.

## Swagger y API First

Cada aplicación NestJS monta Swagger UI en /docs y JSON en /docs-json con @nestjs/swagger; carga el contrato raíz y filtra operaciones por su tag Auth/Payments/Audit, preservando components y security. No hay generación desde implementación que reemplace la fuente YAML. Dentro de Swagger usar server relativo /api/v1 para Try it out sobre el mismo servicio. Los servicios continúan privados en Compose/Dokploy.
