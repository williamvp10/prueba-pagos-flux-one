# Prueba pagos Flux One

Monorepo planeado para un portal de pagos COP con arquitectura hexagonal, SDD, API First y trunk-based development.

**Estado: las tres APIs, el portal/BFF y el riel están integrados en `main`.** Auth, payments y audit usan NestJS/TypeORM y exponen Swagger; el portal Next.js se comunica por el BFF con cookies HttpOnly; el riel conserva respuestas idempotentes en SQLite. Compose define la pila completa. El remote `origin` está configurado; esta integración quedó local y no se hizo push ni despliegue VPS.

## Leer primero

| Documento | Contenido |
|---|---|
| [Spec](docs/spec.md) | Reglas, criterios Given/When/Then y casos de fallo |
| [Arquitectura](docs/architecture.md) | Servicios, puertos, límites y diagramas Mermaid |
| [Modelo de datos](docs/data-model.md) | Propiedad, transacciones, locks e invariantes |
| [API browser](docs/browser.openapi.yaml) | Contrato frontend → BFF con cookies, sin tokens en body |
| [API de servicios](docs/openapi.yaml) | Contrato privado auth, pagos y auditoría; cliente servidor generado |
| [API del riel](docs/rail.openapi.yaml) | Los tres endpoints del mock y sus respuestas |
| [Eventos](docs/events.md) | Outbox, contrato JSON Schema, reintentos y consumidor |
| [Frontend](docs/frontend.md) | Pantallas, componentes shadcn, tema y estados |
| [Despliegue](docs/deployment.md) | Compose, variables, redes, migraciones y Dokploy |
| [Verificación documental](docs/verification.md) | Checks ejecutados y límites de evidencia |
| [Pruebas y trazabilidad](docs/traceability.md) | Criterio → prueba planeada → evidencia pendiente |
| [Plan de trabajo](docs/plan.md) | Orden, gates, trunk y checklist de entrega |
| [Decisiones](docs/adr/README.md) | Registro de decisiones arquitectónicas |
| [Uso de IA](docs/ai-log.md) | Delegación, correcciones y pendientes reales |

## Colaboración y contexto

Leer [AGENTS.md](AGENTS.md) y [coordinación](docs/collaboration.md) antes de editar. Los prompts de agentes están en [rail-mock](docs/prompts/rail-mock-agent.md) y [frontend](docs/prompts/frontend-agent.md). [Graphify](docs/graphify.md) permite consultar contexto local con `./tools/graphify query "idempotencia" --budget 1200`; coordinador reconstruye con `./tools/graphify rebuild`.

## Stack decidido

TypeScript, pnpm workspaces, NestJS, TypeORM, PostgreSQL, RabbitMQ, Next.js App Router, shadcn, Tailwind y TanStack Query. Mock bancario Node.js/TypeScript con SQLite persistente. Node 24 LTS como runtime objetivo; fijar versiones compatibles y lockfile durante bootstrap.

## Arranque local completo

Requiere Docker Compose v2 y Node 24. Desde un clon:

```sh
node tools/setup-env.mjs
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d --wait
```

El primer comando genera `.env` con credenciales y claves propias. No lo versiona ni sobrescribe si ya existe. Las credenciales demo quedan solo allí. Compose inicializa roles, aplica migraciones y seeds sin resetear saldos; las APIs y dependencias se publican en loopback únicamente con el override de desarrollo. El portal queda disponible en http://localhost:3000.

| Servicio | Swagger local | Salud |
|---|---|---|
| Auth | http://localhost:3101/docs | http://localhost:3101/health/ready |
| Payments | http://localhost:3102/docs | http://localhost:3102/health/ready |
| Audit | http://localhost:3103/docs | http://localhost:3103/health/ready |

`/docs-json` devuelve el OpenAPI filtrado del servicio. Swagger usa el contrato YAML aprobado y permite bearer auth. Puertos dev configurables mediante AUTH_DEV_PORT/PAYMENTS_DEV_PORT/AUDIT_DEV_PORT. PostgreSQL local 15432 y AMQP local 15672, ambos solo 127.0.0.1; para una pila paralela usa `POSTGRES_DEV_PORT` y `RABBITMQ_DEV_PORT`.

## Desarrollo, contratos y pruebas

```sh
pnpm install --frozen-lockfile
pnpm contracts
pnpm test
pnpm test:all
```

La suite usa PostgreSQL/RabbitMQ de Compose, crea y destruye una DB y vhost de test exclusivos y levanta APIs de prueba en 13001–13003. No resetea datos demo. Comprueba dinero exacto, 20 peticiones con la misma key, sobregiro concurrente, reverso único, rollback por fallo de outbox, rotación de sesión, permisos, entrega real AMQP, Swagger y respuestas HTTP contra OpenAPI. Los fallos bancarios se prueban con un proveedor HTTP controlado en tests; no sustituyen integración con el rail-mock del otro agente.

`pnpm test` cubre backend (3 unitarias + 13 de integración/configuración). `pnpm test:all` añade las 8 pruebas SQLite del rail y el typecheck, 3 unitarias y build de producción del frontend. El smoke de Compose y los flujos por BFF se registran en [verificación](docs/verification.md); la matriz separa la cobertura directa del componente y la integración entre procesos. CI está configurado, pero no ejecutado remotamente.

## Supuestos y límites

- El evaluador aclaró que debemos construir el riel y podemos elegir el response body. Se conservan los tres endpoints originales.
- `auth_schema` complementa los dos esquemas explícitos del enunciado y mantiene aislamiento.
- Dos usuarios demo: A posee ACC-001/ACC-003; B posee ACC-002. Registro público crea cuenta con saldo cero.
- No payment links, correo de recuperación, alta libre de beneficiarios ni panel de administración en v1.
- Objetivo de entrega comunicado: 15 de octubre de 2026, 11:30, America/Bogota; spec inicial antes de las 09:00. El historial real de Git determina los tiempos, sin backdating.
- Publicación pública, invitaciones y correo de entrega permanecen pendientes; no se hizo push durante esta integración.

## Con una hora adicional

Priorizar verificación y despliegue real en Dokploy, recuperación operativa de mensajes fallidos, observabilidad y revisión de seguridad. Registrar al cierre qué quedó realmente pendiente; esta lista es una intención, no evidencia de entrega.
