# Flux One · Plataforma de pagos

Demo de pagos y transferencias en COP, construida con API First y Spec-driven development. Incluye cuentas demo, transferencias entre usuarios, transferencias externas contra un riel bancario simulado, idempotencia, reversos y auditoría.

**Aplicación en vivo:** [central-banking-system.dokploywill.dpdns.org](https://central-banking-system.dokploywill.dpdns.org/)

**Repositorio:** [github.com/williamvp10/prueba-pagos-flux-one](https://github.com/williamvp10/prueba-pagos-flux-one)

## Probar la aplicación

La cuenta demo #2 corresponde a `demo.b@fluxone.local` y tiene asignada únicamente la cuenta `ACC-002`. La contraseña de producción se comparte en el correo de entrega; no se publica en este repositorio. Las cuentas demo son ficticias y sus saldos sirven solo para probar el flujo.

En la aplicación se puede consultar saldo e historial, transferir a otra cuenta demo o al riel simulado, revisar eventos de auditoría y solicitar el reverso de una transferencia cuando su estado lo permite. El riel no conecta con bancos reales.

## Arquitectura

El monorepo usa pnpm workspaces y TypeScript. El portal Next.js sirve también como BFF y mantiene la sesión en cookies HttpOnly. Los servicios NestJS separan autenticación, pagos y auditoría; TypeORM conecta cada servicio a PostgreSQL con esquemas y credenciales aislados. RabbitMQ entrega eventos desde un outbox transaccional. El servicio `rail-mock` simula el banco externo y conserva transferencias y reversos en SQLite.

Compose define doce servicios, una red privada y volúmenes persistentes. En Dokploy el portal se publica por HTTPS y el resto de servicios queda dentro de la red privada. El despliegue activo se verificó el 15 de octubre de 2026: el dominio responde, `/login` devuelve 200, `/` redirige a `/accounts` y `/api/health` informa `ready`.

## Arranque local

Requisitos: Docker Compose v2, Node.js 24 y Corepack/pnpm 10.25. Desde la raíz del repositorio:

```sh
corepack enable
pnpm install --frozen-lockfile
node tools/setup-env.mjs
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d --wait
```

El portal queda en `http://localhost:3000` por defecto. Si el puerto está ocupado, configura `WEB_PORT` en `.env`. El setup genera credenciales locales y conserva las existentes; `.env` está excluido de Git. Para detener los servicios sin borrar los datos:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

No uses `down -v` si quieres conservar usuarios, saldos, eventos y resultados del riel.

| Servicio | URL local |
|---|---|
| Portal | `http://localhost:3000` (o `WEB_PORT`) |
| Swagger Auth | `http://localhost:3101/docs` |
| Swagger Payments | `http://localhost:3102/docs` |
| Swagger Audit | `http://localhost:3103/docs` |
| Health del portal | `http://localhost:3000/api/health` |

Los puertos de desarrollo se enlazan a loopback. PostgreSQL y RabbitMQ no se exponen públicamente; el override local los publica únicamente en `127.0.0.1`.

## Contratos y verificación

Los contratos OpenAPI son la fuente compartida por el backend y el frontend. `docs/browser.openapi.yaml` define la API del BFF hacia el navegador; `docs/openapi.yaml` define las APIs privadas; `docs/rail.openapi.yaml` define los tres endpoints del mock bancario. NestJS sirve Swagger por servicio desde esos contratos.

```sh
pnpm contracts
pnpm test
pnpm test:all
```

La última ejecución documentada de `pnpm test:all` pasó: pruebas backend, 8 pruebas del mock, typecheck, pruebas unitarias del frontend y build Next.js de producción. También se validó un smoke aislado de Compose con login por BFF, transferencia externa completada, reverso confirmado y eventos de auditoría consultables. La matriz de [trazabilidad](docs/traceability.md) identifica qué criterios tienen prueba completa y cuáles conservan cobertura parcial o pendiente; [verificación](docs/verification.md) contiene el detalle y los límites de evidencia. El workflow de CI está configurado, pero aún no hay evidencia de una ejecución remota en GitHub.

## Documentación

| Documento | Contenido |
|---|---|
| [Spec](docs/spec.md) | Reglas de negocio y criterios de aceptación |
| [Arquitectura](docs/architecture.md) | Servicios, límites, comunicación y diagramas |
| [Modelo de datos](docs/data-model.md) | Entidades, propiedad, transacciones e invariantes |
| [API del navegador](docs/browser.openapi.yaml) | Contrato del portal/BFF con cookies HttpOnly |
| [API de servicios](docs/openapi.yaml) | Contratos privados de Auth, Payments y Audit |
| [API del riel](docs/rail.openapi.yaml) | Endpoints del banco simulado |
| [Eventos](docs/events.md) | Outbox, mensajes, reintentos y consumo |
| [Frontend](docs/frontend.md) | Pantallas, shadcn/ui, estados y temas |
| [Despliegue](docs/deployment.md) | Compose, `.env.dokploy`, redes y operación en Dokploy |
| [Verificación](docs/verification.md) | Pruebas, smoke e historial de validación |
| [Trazabilidad](docs/traceability.md) | Requisitos y estado de prueba por criterio |
| [Plan](docs/plan.md) | Flujo SDD, trunk-based y estado de entrega |
| [Decisiones](docs/adr/README.md) | Decisiones arquitectónicas registradas |
| [Uso de IA](docs/ai-log.md) | Delegación, integración y errores corregidos |
| [Colaboración](docs/collaboration.md) | Reglas de ownership e integración para agentes |
| [Graphify](docs/graphify.md) | Recuperación local del contexto del repo |

## Alcance y límites

La aplicación es una prueba técnica demostrativa, no un producto bancario listo para procesar dinero real. El riel es simulado, los saldos son ficticios y no hay conexión con bancos. No incluye recuperación de contraseña por correo ni alta de beneficiarios. La suite aún deja escenarios de recuperación ante fallos y pruebas de navegador pendientes; el estado por requisito está marcado en la matriz para evitar presentar cobertura parcial como completa.

El archivo `.env.dokploy` contiene secretos y credenciales de demo de producción; se mantiene fuera de Git. Usa `.env.example` como referencia de nombres de variables y `docs/deployment.md` para configurar Dokploy. Mantén estables los IDs y las contraseñas demo entre despliegues, porque el seed es idempotente.
