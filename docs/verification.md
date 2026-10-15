# Verificación documental e implementación

Fecha: 2026-10-15, America/Bogota. Este documento conserva verificaciones por fase; el bloque final describe el backend actual.

| Verificación real | Resultado |
|---|---|
| Redocly CLI 2.64.0, OpenAPI de servicios/browser/mock | Válidos, cero errores; 4 warnings de estilo: licencia sin URL y server localhost de desarrollo |
| Mermaid CLI 12.0.0, render con Chrome | 6 diagramas convertidos a SVG sin errores de sintaxis |
| AJV 8 con ajv-formats, JSON Schema 2020-12 | Schema compila, ejemplo válido, monto numérico rechazado |
| Correspondencia spec → matriz | 74 IDs únicos y una fila por criterio tras incorporar links QR |
| Enlaces Markdown locales | Targets existentes |
| Payloads financieros servicio/browser | Schemas iguales |
| Rutas del mock | Exactamente los 3 endpoints de la tabla |
| Sesión browser | Login referencia BrowserSession; no existe schema Tokens en contrato browser |
| git diff --check | Sin errores de whitespace |

Los warnings no se ocultan: no se eligió licencia de distribución y no hay dominio final. UNLICENSED expresa ausencia de permiso de uso, no una licencia open source. Ajustar licencia cuando el propietario decida; reemplazar localhost al publicar la URL del entorno.

## Cómo repetir validación de contratos

Desde la raíz del repositorio, con Node/npm disponibles:

```sh
npx --yes @redocly/cli@2.64.0 lint docs/openapi.yaml docs/browser.openapi.yaml docs/rail.openapi.yaml
npm exec --yes --package=ajv-cli@5.0.0 --package=ajv-formats@3.0.1 -- ajv validate --spec=draft2020 -c ajv-formats -s docs/contracts/audit-event.v1.schema.json -d docs/contracts/audit-event.v1.example.json
```

Para Mermaid, usar @mermaid-js/mermaid-cli@12.0.0 con Chrome/Chromium disponible y su configuración de Puppeteer. Renderizar architecture.md, data-model.md y deployment.md hacia un directorio temporal. Esta sesión usó Chrome de macOS y generó los seis SVG en /tmp/fluxone-diagrams; esos intermediarios no son entregables ni parte del repo.

## Límites de evidencia

La tabla inicial registra validaciones documentales de la primera fase; las secciones posteriores agregan evidencia de las aplicaciones y el despliegue. El despliegue público actual se describe al final. `origin` está configurado y este checkout puede incluir documentación local posterior al commit desplegado. No se han enviado invitaciones ni el correo de entrega.

El commit inicial 890d03d se creó a las 09:02:38 -05:00, después del hito de 09:00. Se conserva historial auténtico. Los contratos se corrigieron después mediante otro commit, sin amend ni cambio de fechas.

## Graphify y colaboración

- Skill oficial instalada en .codex/skills/graphify, scope de proyecto; no settings globales modificados. Wrapper ./tools/graphify usa graphifyy 0.9.62 y PyYAML 6.0.3 para rebuild.
- Rebuild real genera graph.json, graph.html, GRAPH_REPORT.md y context-manifest.json. Consultas query/explain devuelven ubicaciones de specs; path de navegación documental se prueba con --undirected.
- Índice inicial con más de 280 nodos; tamaño exacto puede crecer con nueva documentación. Imports externos/no resueltos se omiten con conteo explícito; ninguna dependencia de aplicación se considera implementada por aparecer en docs.
- .graphifyignore excluye skills vendor, secretos, outputs y dependencias. graphify-out está ignorado por Git. Solo coordinador reconstruye; ningún auxiliar iniciado desde esta sesión.
- AGENTS, estrategia de coordinación y prompt del mock presentes; ownership por rutas y un único responsable de commits/lockfile.

## Backend implementado y verificado

- `pnpm contracts`: tipos de servicios y browser generados y exportados en @fluxone/api-client.
- `pnpm test`: build de kit y tres servicios, 13 unitarias de Payments (dinero y conciliación) y 13 tests de integración/configuración aprobados. Respuestas HTTP de la suite verificadas contra el contrato fuente.
- `node --test --test-name-pattern=IDEM-05 tests/backend.test.cjs`: rollback tras escribir débito/crédito y fallar outbox de completed, aprobado.
- PostgreSQL/RabbitMQ reales en Docker; DB y vhost de test exclusivos se crean y eliminan. Simulador HTTP bancario exclusivamente de test; no sustituye el servicio delegado.
- `docker compose config --quiet`: configuración válida. `docker compose build auth`: imagen backend construida con los tres servicios. Arranque dirigido a auth/payments/audit ejecuta init, migraciones y seed. Swagger y salud dev 3101/3102/3103 responden 200.
- CI completo configurado en .github/workflows/backend.yml para `pnpm test:all`; no se ha ejecutado en GitHub.
- Pruebas pendientes: ventanas reales de crash entre confirm/update y persist/ack, escenarios específicos de reversos externos y UI en navegador. El Compose completo y el despliegue Dokploy se validaron en fases posteriores.

Correcciones verificadas: normalización del resultado UPDATE RETURNING de TypeORM, enum nullable de reversalStatus, cursor sin pérdida de microsegundos y credenciales propias de audit en Compose. Puerto ajeno 3001 conservado intacto; backend dev usa 3101–3103.

## Integración de rail y frontend

- Las ramas auxiliares quedaron limpias después de los commits de entrega. `main` contiene `e6462b9` (rail) y `8d0931b` (frontend); el coordinador agregó el cableado de Compose y el build standalone del portal en commits posteriores.
- `pnpm test:all` pasó: backend 3 unitarias + 13 integración/configuración; rail 8/8 más análisis de fuentes con Node 24.11.0; frontend typecheck, 3/3 unitarias y build Next.js 16.4.1.
- `docker compose ... config --quiet` aprobó y las imágenes `web` y `rail-mock` construyeron. El proyecto aislado `fluxone-int` arrancó todos los servicios y healthchecks. Se parametrizaron puertos del override de desarrollo para evitar colisiones con los servicios existentes.
- Smoke integrado por HTTP contra el BFF: login `200` devuelve solo usuario/expiración y cookies HttpOnly; cuentas `200`; transferencia externa `202 → COMPLETED` a través del riel; reverso externo `202 → REVERSED`; auditoría `200` con cuatro eventos; logout `204`. Se usó un PostgreSQL, RabbitMQ y SQLite aislados con escenario aceptado, sin tocar saldos demo del proyecto principal.
- El healthcheck web detectó y permitió corregir la ruta del servidor standalone bajo `apps/web/server.js`. La primera versión del Dockerfile del mock no correspondía al contexto raíz; Compose también expuso colisión de puertos durante el smoke, resuelta con overrides configurables.

## Compose de producción y cuentas demo

- `docker compose -f docker-compose.yml config --quiet` y el override dev aprobaron. El Compose base define los 12 servicios, red privada y volúmenes persistentes; no publica puertos al host y expone web internamente en 3000. El override dev publica solo en loopback, incluido el portal en `WEB_PORT`.
- Dokploy está documentado para usar Compose (no Stack), dominio nativo en el servicio `web` con destino 3000, HTTPS y variables del editor Environment. Su integración agrega labels y red de Traefik al servicio elegido; las variables Compose se mapean explícitamente a cada contenedor.
- El seed añade Demo C y asigna A/B/C a ACC-001/002/003. Al actualizar un volumen existente, mueve ACC-003 solo si aún pertenece a A como SECONDARY; conserva saldo y ledger. El `.env` local ya tiene credenciales C; `.env.example` y `tools/setup-env.mjs` contemplan las tres identidades sin versionar secretos.
- Stack local reconstruido con Compose base y dev override; servicios healthy. Los logins BFF de A/B/C dieron 200 y cada usuario recibió una sola cuenta. Los saldos ya existentes se conservaron.
- `pnpm test:all` pasó tras el cambio: 13 pruebas unitarias de Payments, 13 de integración/configuración, 8 del mock, 3 del frontend, typecheck y build de Next.js. Las ocho nuevas de `reconcile.spec.ts` comprueban liquidación externa y reversos aceptados, rechazados, pendientes e inciertos; dos casos adicionales validan límites exactos de saldo disponible y crédito máximo.

Límites: no se hizo una prueba automatizada en navegador ni revisión visual completa de tema claro/oscuro; UI-01..05 siguen pendientes de evidencia browser. El mock valida sintaxis/runtime de type stripping, no tipos TypeScript semánticos. CI remoto sigue pendiente.

## Despliegue público

El Compose de producción se desplegó en Dokploy desde `6a71e46` en [central-banking-system.dokploywill.dpdns.org](https://central-banking-system.dokploywill.dpdns.org/). Se observaron respuestas `/` → 307 a `/accounts`, `/login` → 200 y `/api/health` → 200 (`ready`). Contenedores persistentes y de aplicación quedaron healthy; init, migraciones y seed finalizaron con código 0. Desde el BFF se autenticó Demo B, se confirmó el ID de usuario configurado y se obtuvo una cuenta con `GET /api/v1/accounts` (200). La prueba no expuso la contraseña ni cookies en la salida. Es un smoke de disponibilidad, ruteo y acceso, no una revisión completa de seguridad, respaldo, recuperación ante fallos o carga.

## Backend de links de cobro QR

- Se añadieron LINK-01..08 y UI-06..09, el contrato técnico `docs/payment-links.md`, arquitectura, modelo de datos/DBML, trazabilidad y prompt aislado para el agente frontend.
- `npx --yes @redocly/cli@2.64.0 lint docs/openapi.yaml docs/browser.openapi.yaml docs/rail.openapi.yaml`: contratos válidos, cero errores y los mismos cuatro warnings conocidos de licencia/localhost.
- AJV draft 2020-12 con formats: schema `audit-event.v1` y ejemplo actualizado con `paymentLinkId` opcional, válidos.
- `pnpm contracts`: regeneró `ServicePaths/ServiceComponents` y `BrowserPaths/BrowserComponents` con las operaciones/schemas de payment-links.
- Comparación estructural con `js-yaml`: 12 schemas financieros compartidos idénticos y las 7 operaciones de links presentes en servicio y browser.
- `pnpm typecheck`: aprobó backend-kit, auth, payments, audit y web con los tipos regenerados.
- `npm exec --package=@dbml/cli@5.2.0 -- dbml2sql docs/database.dbml --postgres`: DBML parseó y produjo 229 líneas SQL; los warnings mostrados fueron de dependencias transitivas de la CLI temporal.
- Conteo focalizado: 74 criterios en `spec.md`, 74 filas en `traceability.md` y ningún `operationId` duplicado en el contrato privado.
- `git diff --check` solo reporta el whitespace preexistente y ajeno en `apps/payments/src/application/payments.ts:183`; los archivos SDD de esta fase no agregan errores de whitespace.
- Implementación Payments: migración aditiva `payment_links` y relación única transfer-link; token HMAC-SHA256 con secreto de 32 bytes que no se persiste; endpoints autenticados de crear/listar/consultar/compartir/resolver/pagar/cancelar; locks PostgreSQL, pago/ledger/outbox/idempotencia atómicos y privacidad creador/pagador.
- `pnpm test`: build de backend, 15/15 pruebas unitarias Payments y 15/15 integración/configuración. Las respuestas HTTP se validan con OpenAPI. LINK-01..08 están verificados en `traceability.md`; pruebas incluyen firma alterada, 20 pagos concurrentes, error financiero sin efectos, acceso de participantes y reverso.
- La firma secreta se generó localmente con `tools/setup-env.mjs`, preservando secretos existentes; se inyecta solo al servicio payments. No se versionó `.env` ni el secreto.
- Rollback link por fallo técnico inyectado después de ledger queda como ampliación; el rollback transaccional general y la ausencia de efectos parciales ante errores de negocio sí se verificaron.
- UI-06..09 implementados por el frontend; evidencia de recorrido browser local agregada abajo. La comprobación de usuario no participante encontró una respuesta API 404 sin datos del cobro; la página de detalle queda visualmente vacía en ese estado, aunque el componente define un mensaje de error. Pendiente corregir/verificar ese estado visual.

## Verificación browser de links QR

- Integración local en `main`: `858f6a1` (`feat(web): add payment links and QR checkout`). El commit fuente del worktree del agente (`2b62ce0`) tiene el mismo árbol de archivos; no se duplicó con cherry-pick. `f8a798f` registra el handoff frontend.
- Compose E2E aislado `fluxone-payment-links-e2e`, puertos loopback 3210–3213 y dependencias/volúmenes separados del stack habitual. Los healthchecks quedaron healthy. Al terminar se detuvieron y retiraron sus contenedores/red sin borrar los volúmenes; el stack existente no se modificó.
- Recorrido real en navegador: A (`demo.a`) inicia sesión, crea cobro por 250,50 COP desde ACC-001 y obtiene detalle QR/link activo; el tercero B (`demo.b`) abre `/pay`, inicia sesión inline, confirma el monto y paga desde ACC-002; la transferencia queda `COMPLETED` hacia ACC-001 y el detalle de A pasa a `PAID`, sin volver a mostrar el token de compartir.
- Auditoría del flujo muestra `transfer.created` y `transfer.completed`. La página de transferencia completada se abrió desde el flujo del pago.
- Privacidad negativa: C (`demo.c`), no participante, al consultar directamente el ID del link recibe HTTP 404 sin contenido del cobro. Observación UX pendiente: la vista de detalle deja `<main>` vacío ante este error, pese a que el componente contempla una tarjeta de error.
- `pnpm test:all`: aprobado (15 Payments unitarias, 15 integración/configuración backend, 8 rail-mock, 9 web, typecheck y build de producción). Esto cubre tests y compilación; el recorrido browser anterior es evidencia manual adicional.
