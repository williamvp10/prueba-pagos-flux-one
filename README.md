# Prueba pagos Flux One

Monorepo planeado para un portal de pagos COP con arquitectura hexagonal, SDD, API First y trunk-based development.

**Estado: backend implementado y verificado localmente.** Auth, payments y audit compilan, ejecutan en Docker y exponen Swagger. Frontend y riel oficial del proyecto permanecen asignados a otros agentes; su integración completa está pendiente. No hay despliegue VPS ni remote configurado.

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

Leer [AGENTS.md](AGENTS.md) y [coordinación](docs/collaboration.md) antes de editar. El [prompt del agente auxiliar](docs/prompts/rail-mock-agent.md) reserva únicamente el mock bancario. [Graphify](docs/graphify.md) permite consultar contexto local con `./tools/graphify query "idempotencia" --budget 1200`; coordinador reconstruye con `./tools/graphify rebuild`.

## Stack decidido

TypeScript, pnpm workspaces, NestJS, TypeORM, PostgreSQL, RabbitMQ, Next.js App Router, shadcn, Tailwind y TanStack Query. Mock bancario Node.js/TypeScript con SQLite persistente. Node 24 LTS como runtime objetivo; fijar versiones compatibles y lockfile durante bootstrap.

## Arranque verificado del backend

Requiere Docker Compose y Node 24. Desde un clon, tres comandos:

```sh
node tools/setup-env.mjs
docker compose -f docker-compose.yml -f docker-compose.dev.yml build auth
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --no-build auth payments audit rabbitmq
```

El primer comando genera `.env` con credenciales y claves propias. No lo versiona ni sobrescribe si ya existe. Consultar allí credenciales demo localmente. Compose inicializa roles, aplica migraciones y seeds sin resetear saldos. Solo el override de desarrollo publica APIs y dependencias en loopback; el Compose base mantiene servicios privados.

| Servicio | Swagger local | Salud |
|---|---|---|
| Auth | http://localhost:3101/docs | http://localhost:3101/health/ready |
| Payments | http://localhost:3102/docs | http://localhost:3102/health/ready |
| Audit | http://localhost:3103/docs | http://localhost:3103/health/ready |

`/docs-json` devuelve el OpenAPI filtrado del servicio. Swagger usa el contrato YAML aprobado y permite bearer auth. Puertos dev configurables mediante AUTH_DEV_PORT/PAYMENTS_DEV_PORT/AUDIT_DEV_PORT. PostgreSQL local 15432 y AMQP local 15672, ambos solo 127.0.0.1.

**Arranque completo pendiente:** `docker compose up --build -d` también incluye web y rail-mock; necesita los Dockerfiles/implementaciones de los auxiliares. No se afirma que ese flujo completo esté validado todavía. En el backend operativo, las externas conservan reserva y estado UNKNOWN si el riel no está disponible; no usar una transferencia externa para probar éxito hasta integrar el servicio.

## Desarrollo, contratos y pruebas

```sh
pnpm install --frozen-lockfile
pnpm contracts
pnpm test
```

La suite usa PostgreSQL/RabbitMQ de Compose, crea y destruye una DB y vhost de test exclusivos y levanta APIs de prueba en 13001–13003. No resetea datos demo. Comprueba dinero exacto, 20 peticiones con la misma key, sobregiro concurrente, reverso único, rollback por fallo de outbox, rotación de sesión, permisos, entrega real AMQP, Swagger y respuestas HTTP contra OpenAPI. Los fallos bancarios se prueban con un proveedor HTTP controlado en tests; no sustituyen integración con el rail-mock del otro agente.

Evidencia actual: 3 pruebas unitarias y 13 de integración/configuración aprobadas. Ver [verificación](docs/verification.md) y [matriz](docs/traceability.md) para distinguir cobertura completa, parcial y pendiente. CI backend está configurado, pero no ejecutado remotamente.

## Supuestos y límites

- El evaluador aclaró que debemos construir el riel y podemos elegir el response body. Se conservan los tres endpoints originales.
- `auth_schema` complementa los dos esquemas explícitos del enunciado y mantiene aislamiento.
- Dos usuarios demo: A posee ACC-001/ACC-003; B posee ACC-002. Registro público crea cuenta con saldo cero.
- No payment links, correo de recuperación, alta libre de beneficiarios ni panel de administración en v1.
- Objetivo de entrega comunicado: 15 de octubre de 2026, 11:30, America/Bogota; spec inicial antes de las 09:00. El historial real de Git determina los tiempos, sin backdating.
- Repositorio público, invitaciones y correo de entrega permanecen pendientes; no hay remote configurado.

## Con una hora adicional

Priorizar verificación y despliegue real en Dokploy, recuperación operativa de mensajes fallidos, observabilidad y revisión de seguridad. Registrar al cierre qué quedó realmente pendiente; esta lista es una intención, no evidencia de entrega.
