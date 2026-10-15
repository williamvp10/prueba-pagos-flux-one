# Prueba pagos Flux One

Monorepo planeado para un portal de pagos COP con arquitectura hexagonal, SDD, API First y trunk-based development.

**Estado: especificación y arquitectura.** Todavía no hay aplicaciones ni infraestructura ejecutable. Los contratos describen el comportamiento objetivo, no una API desplegada.

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

## Arranque objetivo — pendiente de implementación

Una vez implementado, desde un clon del repo:

```sh
cp .env.example .env
# Completar secretos y configuración de demo en .env.
docker compose up --build -d
docker compose ps
```

No ejecutar todavía: `docker-compose.yml` y `.env.example` son entregables de la fase de implementación. Compose deberá inicializar/migrar y cargar seeds sin comandos manuales adicionales. El README se actualizará con comandos y URLs verificados, credenciales demo configurables, pruebas reales y limitaciones al cerrar la entrega.

## Supuestos y límites

- El evaluador aclaró que debemos construir el riel y podemos elegir el response body. Se conservan los tres endpoints originales.
- `auth_schema` complementa los dos esquemas explícitos del enunciado y mantiene aislamiento.
- Dos usuarios demo: A posee ACC-001/ACC-003; B posee ACC-002. Registro público crea cuenta con saldo cero.
- No payment links, correo de recuperación, alta libre de beneficiarios ni panel de administración en v1.
- Objetivo de entrega comunicado: 15 de octubre de 2026, 11:30, America/Bogota; spec inicial antes de las 09:00. El historial real de Git determina los tiempos, sin backdating.
- Repositorio público, invitaciones y correo de entrega permanecen pendientes; no hay remote configurado en esta fase.

## Con una hora adicional

Priorizar verificación y despliegue real en Dokploy, recuperación operativa de mensajes fallidos, observabilidad y revisión de seguridad. Registrar al cierre qué quedó realmente pendiente; esta lista es una intención, no evidencia de entrega.
