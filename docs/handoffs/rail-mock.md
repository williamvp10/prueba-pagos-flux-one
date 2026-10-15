# Handoff — riel bancario

Estado: INTEGRATED / VERIFIED en `main` (`e6462b9` + integración de Compose).

Propietario: auxiliar de rail-mock. Trabajo realizado en la rama `agent/rail-mock` dentro del worktree `/tmp/fluxone-rail-mock`; no se hizo commit.

## Rutas entregadas

- `apps/rail-mock/package.json`: paquete `@fluxone/rail-mock`, Node 24 y scripts build/start/test.
- `apps/rail-mock/tsconfig.json`: configuración local standalone.
- `apps/rail-mock/src/rail.ts`: validación, normalización monetaria con bigint, SHA-256, persistencia SQLite, idempotencia global, escenarios y reversos.
- `apps/rail-mock/src/server.ts`: factory HTTP, tres rutas del contrato y readiness interno; cierre limpio.
- `apps/rail-mock/src/main.ts`: arranque en `0.0.0.0`, puerto configurable y cierre SIGINT/SIGTERM.
- `apps/rail-mock/src/rail.test.ts`: ocho pruebas con DB temporal y puertos efímeros.
- `apps/rail-mock/scripts/build.mjs`: comprueba que Node 24 pueda analizar y quitar tipos de todas las fuentes TypeScript.
- `apps/rail-mock/Dockerfile` y `apps/rail-mock/README.md`.
- `docs/handoffs/rail-mock.md`.

## Contrato y criterios

Implementados `POST /rail/transfers`, `GET /rail/transfers/{reference}` y `POST /rail/reversals` conforme a `docs/rail.openapi.yaml`. `/health/ready` solo es readiness interno. No se añadió GET de reversos ni se modificaron contratos.

- **MOCK-01:** payload normalizado y persistido con hash SHA-256; replay conserva el resultado y cambios de payload o tipo bajo la misma referencia responden 409.
- **MOCK-02:** transferencias y reversos sobreviven reapertura de SQLite; GET de transferencia incluye el intento más reciente de reverso.
- **MOCK-03:** modo `test` consume escenarios configurados y luego usa `accepted`; modo `random` selecciona uniformemente entre cinco escenarios. Un 503 y `timeout_not_processed` no guardan operación; `timeout_processed` guarda antes de esperar 12 segundos.
- **RAIL/REV:** transferencias aceptadas o rechazadas, errores de monto/formato, referencias inválidas, reintentos de reverso, máximo un reverso aceptado por original bajo concurrencia y reverso rechazado seguido por otro intento.

## Verificación ejecutada

Desde `apps/rail-mock/`:

- `npm run build` — pasó; Node v24.11.0 analizó las cuatro fuentes TypeScript.
- `npm test` — 8/8 pasaron, 0 fallidas; duración 36.2 s. Incluye espera medida de 12 s para `timeout_not_processed` y persiste la aceptación antes de la respuesta demorada de `timeout_processed`.
- `docker build -f Dockerfile -t fluxone-rail-mock-local .` — pasó.
- Smoke del contenedor: `GET /health/ready` devolvió `{"status":"ready"}` y `POST /rail/transfers` devolvió 200 `ACCEPTED`, normalizando `12.3` a `12.30`. Se detuvo el contenedor de verificación.

`npm run build` valida sintaxis/runtime de type stripping de Node; no ejecuta un typecheck semántico de TypeScript. No se instalaron dependencias ni se cambió ningún lockfile.

## Integración solicitada

- Dependencias runtime o dev solicitadas: ninguna.
- Compose debe pasar `PORT=3004`, `NODE_ENV`, `RAIL_MODE=random|test`, `RAIL_SCENARIOS` y `RAIL_DB_PATH=/data/rail.sqlite` según el entorno.
- Montar volumen writable en `/data`; el contenedor corre como usuario `node` sin privilegios.
- Variables usadas como defaults por el servicio: `PORT=3004`, `RAIL_MODE=random`, `RAIL_DB_PATH=/data/rail.sqlite`; `RAIL_SCENARIOS` es opcional.
- Limitación de la persistencia: sobrevive reinicios del contenedor mientras el volumen exista; no protege ante pérdida del disco.

Integración central: `docker-compose.yml` construye desde la raíz con el Dockerfile corregido, guarda `/data` en `rail_data`, espera readiness antes de iniciar payments y configura el modo mediante el `.env` compartido. Compose aislado confirmó transferencia aceptada y reverso aceptado a través del backend y del BFF. No existe un typecheck semántico para el rail porque usa type stripping nativo de Node 24.
