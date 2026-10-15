# Flux One — instrucciones para agentes

## 1. Ubicación, objetivo y estado real

La raíz Git es esta carpeta `prueba-pagos-flux-one`, no su directorio padre. Un único repo contiene tres microservicios NestJS (auth/payments/audit), Next.js y un mock bancario independiente. Objetivo: portal de pagos COP con SDD, API First y arquitectura hexagonal, runnable con Docker Compose y preparado para Dokploy.

Documentación/contratos completos; implementación de aplicaciones todavía pendiente al crear estas reglas. Graphify y herramientas de contexto sí están integrados. Antes de actuar comprobar `git status --short`, `git log -3 --oneline` y existencia de manifests/servicios: estas reglas no sustituyen el estado real. No afirmar servicios, tests, CI, remote o despliegue existentes sin comprobarlos.

El evaluador aclaró que nosotros construimos el mock y elegimos sus responses, conservando los tres endpoints de su tabla. Horario informado: 15-10-2026, 11:30 America/Bogota. Spec inicial real: 890d03d, 09:02:38 -05:00, después del hito de 09:00; no alterar fechas.

## 2. Recuperar contexto antes de programar

1. Leer este archivo y `docs/collaboration.md`: propiedad de archivos, asignación y protocolo de entrega.
2. Si existe `graphify-out/graph.json`, consultar `./tools/graphify query "<concepto>" --budget 1200`. También `path "A" "B"` y `explain "concepto"`.
3. Seguir las ubicaciones devueltas y leer solo fuentes pertinentes: el grafo puede estar desactualizado y no autoriza cambios de comportamiento. Si falta, el coordinador ejecuta `./tools/graphify rebuild`.
4. Leer `docs/spec.md` para criterios, `docs/architecture.md` para límites y `docs/data-model.md` para invariantes. Para UI: `docs/frontend.md`; para mock: `docs/rail-mock.md`.
5. Contratos autoritativos: `docs/openapi.yaml` (servicios privados), `docs/browser.openapi.yaml` (BFF/browser), `docs/rail.openapi.yaml` (mock), `docs/contracts/audit-event.v1.schema.json` (eventos). Ver `docs/contracts/README.md`.
6. Leer `docs/traceability.md`, `docs/plan.md` y el handoff de la tarea. La matriz distingue criterio planeado de prueba ejecutada.

Comandos y límites de Graphify: `docs/graphify.md`. Usar wrapper fijado a graphifyy 0.9.62; el `graphify` global de esta máquina es otra versión. No hacer búsquedas masivas por el repo si una consulta acotada resuelve la pregunta. Si la consulta no encuentra contexto, usar rg focalizado y leer la fuente. No leer todo graph.json ni todo el reporte por defecto.

## 3. Trabajo paralelo sin choques

- El coordinador de este chat es propietario de raíz, contratos, documentación central, infraestructura, paquetes compartidos y pagos.
- Auxiliar del riel: exclusivamente `apps/rail-mock/**` y `docs/handoffs/rail-mock.md`. Auxiliar frontend: exclusivamente `apps/web/**` y `docs/handoffs/frontend.md`. Usuario inicia las dos sesiones; no duplicarlas automáticamente. Coordinador conserva auth/payments/audit, raíz e infraestructura.
- No empezar otro servicio ni tocar archivos ajenos sin asignación explícita. El prompt de trabajo define alcance; pedir cambio al coordinador si hay bloqueo contractual.
- Compartimos checkout: solo el coordinador opera el índice Git, crea commits, instala dependencias del workspace y modifica lockfiles. El agente auxiliar no ejecuta git add/commit/stash/reset/checkout/clean ni modifica la rama.
- Prohibido `git add .` o `git add -A` durante trabajo concurrente. Coordinador añade rutas explícitas y solo integra entregas confirmadas terminadas.
- No modificar package.json raíz, pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig/eslint raíz, .env*, Compose, AGENTS, contratos, tools ni graphify-out desde una tarea auxiliar.
- Nuevas dependencias se declaran en package.json propio y se solicitan en handoff; solo coordinador actualiza lockfile. No correr install en paralelo, ni siquiera con --filter.
- No regenerar clientes, snapshots, grafo ni formato global desde otro agente. Coordinador único escritor de graphify-out, sin watch ni hooks automáticos durante edición concurrente.
- No revertir ni reformatear cambios ajenos. Si aparece un archivo compartido en el diff, parar esa edición y reportarlo.
- Handshake: tarea reservada → auxiliar implementa en sus rutas → ejecuta verificaciones disponibles → escribe handoff → coordinador revisa/integración/tests/commit → siguiente asignación.

## 4. Stack y estructura objetivo

Node 24 LTS y TypeScript, pnpm workspaces; fijar versiones/lockfile durante bootstrap. Backend NestJS + TypeORM/PostgreSQL. Frontend Next.js App Router, shadcn Radix, Tailwind, TanStack Query, React Hook Form/Zod. RabbitMQ para auditoría. Mock Node.js/TypeScript con SQLite persistente; no necesita NestJS ni DB compartida.

```text
apps/auth/src/{domain,application,infrastructure,bootstrap}/
apps/payments/src/{domain,application,infrastructure,bootstrap}/
apps/audit/src/{domain,application,infrastructure,bootstrap}/
apps/rail-mock/                   # aislado, contrato del riel
apps/web/                        # UI y BFF
packages/api-client/              # generado, solo contratos
packages/event-contracts/         # schemas/tipos versionados
infra/                           # Dockerfiles e init de DB
tools/                           # tooling local Graphify
```

Las carpetas de aplicaciones son objetivo, no evidencia de implementación. No generar una pila alternativa ni añadir Redis/Kafka/Kubernetes/gateway separado sin necesidad y decisión documentada.

## 5. Arquitectura hexagonal obligatoria

- Domain y application no importan NestJS, TypeORM, AMQP, HTTP ni servicios hermanos. Domain contiene invariantes; application orquesta puertos; infrastructure implementa adapters; bootstrap es composition root.
- Entidad TypeORM no es entidad de dominio. Mapear DTO ↔ dominio ↔ persistencia.
- UnitOfWork entrega repositories del mismo EntityManager transaccional. No usar repository global dentro de TX.
- No compartir repositories, tablas ni entidades ORM entre servicios. Solo contratos y utilidades sin negocio.
- Auth escribe auth_schema, payments payment_schema, audit audit_schema, con roles limitados y migrations propias. Sin joins ni FKs cruzadas, sin credenciales admin en runtime.
- Audit autoriza GET consultando payments con JWT original; no lee payment_schema. Indisponibilidad de autorización → 503; recurso ajeno → 404.
- Workers de banco y outbox viven en payments y usan trabajo durable/leases; no locks de negocio solo en memoria.

## 6. Invariantes financieras e idempotencia

- COP, dos decimales; API strings, dominio bigint en centavos. No float/Number para cálculos monetarios. Máximo 999999999999.99 COP.
- Disponible = balance - reserved; ambos no negativos y reserved <= balance. Validar capacidad del destino al acreditar.
- Ledger inmutable; reverso crea compensaciones, nunca borra el original.
- Idempotency-Key obligatorio en transferencia/reverso; índice único persistente (subject, operation, key), hash SHA-256 del payload semántico normalizado y snapshot status/body original.
- Misma key/contenido: replay; distinto: 409. Unicidad/locks DB resuelven carreras. No SELECT-then-INSERT sin constraint y manejo de conflicto.
- Key, efectos financieros, estado, outbox y resultado HTTP se comprometen juntos. Errores definitivos de negocio consumen key; JWT/sintaxis fallidas y TX abortada no. GET revela estado vivo; replay de POST mantiene snapshot.
- Bloquear cuentas en orden estable. Jamás HTTP/AMQP dentro de TX de dinero.
- Externas: reserva antes de enviar, referencia bancaria persistida y estable. Timeout/500/body inválido → UNKNOWN con reserva; 503 declarado sin procesamiento → reintento; REJECTED definitivo libera; ACCEPTED confirma débito.
- Conciliar antes de reenviar tras caída/timeout. GET 404 no autoriza liberar: reenviar con la misma reference idempotente. Nunca generar otra reference por un timeout.
- Solo reverso total de COMPLETED y por propietario del origen. Máximo un reverso activo/exitoso. Interno sin disponible del destinatario → conflicto; externo acredita solo cuando banco confirma.
- Outbox publica con mandatory, persistent y confirms; consumidor ack después del commit. eventId deduplica. No prometer exactly-once de red ni descartar eventos al superar reintentos.

## 7. Auth, frontend y configuración

- Registro/login/refresh rotado/logout. Contraseñas con hash, JWT RS256 access 15 min, refresh 7 días almacenado con hash. Validar issuer/audience/expiración y propiedad de recursos.
- Browser usa BFF/cookies HttpOnly; no tokens en localStorage/sessionStorage ni respuestas browser. Origin check para mutaciones. SessionStorage solo key/payload de intención financiera.
- Bootstrap de cuenta es POST autenticado idempotente por owner, separado del registro. Nuevos usuarios saldo cero; demo A ACC-001/003 y demo B ACC-002 según seed.
- UI en español, estilo tecnológico azul, claro/oscuro/sistema, tokens semánticos y componentes shadcn. Estados loading/empty/error/unknown y accesibilidad por teclado.
- Polling 2 s para estados no terminales; impedir doble clic y conservar key en reintentos. Frontend nunca es autoridad financiera.
- Un .env raíz ignorado, .env.example sin secretos reales. Compose inyecta solo variables necesarias; no compartir todas las credenciales con todos los servicios ni usar NEXT_PUBLIC_ para secretos.
- Migrations explícitas, synchronize false, seeds idempotentes; nunca resetear datos al arrancar ni down -v en VPS.
- Logs sin passwords/tokens/keys/DSNs; IDs de correlación para rastrear operación/evento.

## 8. SDD, pruebas, verificación y entrega

Cambiar spec/contrato antes del comportamiento, mantener IDs y decisiones ADR. Si auxiliar detecta discrepancia, proponerla en handoff; no modificar contratos centrales unilateralmente.

Tests llevan [ID] del criterio. PostgreSQL real para dinero, locks y rollback; RabbitMQ real para confirms/redelivery; mock determinista para fallos del banco. Mocks no demuestran comportamiento transaccional de DB. Ver docs/traceability.md para fixtures y lanes.

Comandos disponibles ahora:

```sh
./tools/graphify rebuild
./tools/graphify query "idempotencia" --budget 1200
npx --yes @redocly/cli@2.64.0 lint docs/openapi.yaml docs/browser.openapi.yaml docs/rail.openapi.yaml
npm exec --yes --package=ajv-cli@5.0.0 --package=ajv-formats@3.0.1 -- ajv validate --spec=draft2020 -c ajv-formats -s docs/contracts/audit-event.v1.schema.json -d docs/contracts/audit-event.v1.example.json
```

Todavía no hay scripts pnpm ni Compose funcional: añadir instrucciones ejecutables solo al verificarlas. Auxiliar no debe descargar tooling ni modificar lockfile fuera de su propiedad para simular un check.

Handoff obligatorio: rutas cambiadas, contrato respetado, criterios cubiertos, comandos y resultados reales, dependencias/variables solicitadas y pendientes. No marcar prueba cubierta por existir un documento. Coordinador actualiza matriz, ai-log, README e integra con commits pequeños sobre main.

No enviar correo, invitaciones ni mensajes a otras personas sin autorización explícita. No falsear fechas, resultados ni autoría. Mantener explicación defendible de cada línea y de los tradeoffs. No hacer push/publicación hasta comprobar configuración y ausencia de secretos.

## Swagger solicitado por el usuario

Auth/payments/audit deben exponer Swagger UI /docs y JSON /docs-json usando @nestjs/swagger con documentos filtrados por tag desde docs/openapi.yaml. Mantener OpenAPI como fuente, bearer auth en Swagger y schemas/errores compatibles. Acceso por red privada, no publicar servicios directamente para mostrar Swagger en VPS. Servir especificación raw por servicio para verificación contractual.
