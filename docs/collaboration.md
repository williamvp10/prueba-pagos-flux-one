# Coordinación de implementación

## Estrategia: tres frentes, un integrador

Mismo repositorio y checkout, con propiedad exclusiva por rutas. Main sigue siendo trunk; el agente auxiliar no toca índice ni rama. El coordinador integra entregas terminadas con commits pequeños por bloque. Esto evita conflictos de lockfile, staging, contratos y formato global.

| Frente | Propietario | Rutas | Estado |
|---|---|---|---|
| Tooling/contexto y coordinación | Chat coordinador | AGENTS.md, tools/**, .codex/**, docs centrales | Graphify y reglas implementados; evidencia en docs/verification.md |
| Monorepo e infraestructura | Chat coordinador | manifests raíz, lockfile, infra/**, Compose, .env.example | Implementado; backend Compose verificado |
| Pagos y contratos compartidos | Chat coordinador | apps/payments/**, packages/**, contratos y specs | Core base implementado; spec/contrato de links QR pertenece al coordinador y su backend queda como siguiente bloque |
| Mock bancario | Agente auxiliar externo; coordinador integrador | apps/rail-mock/** y docs/handoffs/rail-mock.md | Integrado en main; persistencia SQLite y 8 pruebas locales |
| Auth y audit | Chat coordinador | apps/auth/**, apps/audit/** | Implementados, Swagger y health verificados |
| Frontend y BFF | Segundo agente auxiliar; coordinador integrador | apps/web/** y docs/handoffs/frontend.md | Base integrada; nueva tarea de links QR se ejecuta con `docs/prompts/payment-links-frontend-agent.md` |

Los dos auxiliares entregaron ramas cortas desde `d15a9f5`; el coordinador registró commits en cada rama y los integró en `main` como `e6462b9` y `8d0931b`. El cherry-pick del frontend requirió conservar su handoff actualizado. Ambas ramas quedaron limpias tras el commit; el estado final de tests e integración figura en README y verification.

## Archivos compartidos y exclusión

Solo coordinador: package.json raíz, pnpm-workspace.yaml, pnpm-lock.yaml, configs raíz, .env*, Compose, infra, contratos, docs/spec.md, traceability.md, ai-log.md, README, AGENTS y tools. El auxiliar puede crear package.json/tsconfig/Dockerfile/tests exclusivamente dentro de su servicio, sin depender de que exista un scaffold raíz.

No ejecutar installs desde el auxiliar; reportar dependencias necesarias en handoff. No scripts que cambien archivos ajenos, regen de cliente o grafo, format global, git add/commit/stash/reset/clean/checkout. Solo git status/diff/log como lectura. No editar código ajeno aunque parezca una mejora fácil.

## Contrato de integración del mock

- Nombre de paquete: @fluxone/rail-mock. Runtime Node 24 LTS, TypeScript. Usar módulos nativos HTTP, node:sqlite y node:test para no introducir dependencias runtime.
- Puerto 3004, bind 0.0.0.0. Exportar creación del servidor separada del arranque para permitir puertos efímeros en tests y cierre limpio.
- Variables recibidas desde Compose: PORT=3004, NODE_ENV, RAIL_MODE=random|test, RAIL_SCENARIOS y RAIL_DB_PATH=/data/rail.sqlite. No .env propio. main coordina setup/mount/permisos del volumen.
- Tres endpoints bancarios de rail.openapi.yaml; health interno adicional /health/ready según deployment.md (no es endpoint bancario adicional).
- Scripts propios: build/start/test, sin asumir scripts raíz aún existentes. Config TypeScript local standalone mientras no exista config común. Dependencias dev requeridas se listan en handoff para instalación central.
- Un handoff debe indicar cómo lanzar tests con herramientas disponibles, no inventar pnpm commands que todavía no funcionen. Node 24 puede ejecutar TS compatible con type stripping; evitar enums/parameter properties si se usa esa vía.

## Protocolo de entrega

1. Usuario inicia la otra sesión con docs/prompts/rail-mock-agent.md; auxiliar confirma alcance y revisa git status.
2. Lee contexto por Graphify y fuentes indicadas; implementa solo sus rutas.
3. Prueba con SQLite temporal, puertos efímeros y escenarios controlados. No conecta a DB/broker de otro servicio ni mata procesos ajenos.
4. Completa docs/handoffs/rail-mock.md con estado READY_FOR_REVIEW o BLOCKED, rutas, criterios, comandos/resultados, dependencias, variables y limitaciones. No afirmar READY si hay checks core fallidos.
5. Coordinador lee handoff, verifica diff de esas rutas, instala dependencias necesarias una sola vez, valida contrato, integra Compose y ejecuta pruebas antes del commit explícito.
6. Coordinador actualiza matriz/ai-log, commit y grafo. Devuelve nueva tarea si procede; no ampliar alcance silenciosamente.

Si surge una necesidad compartida, dejar propuesta concreta en handoff y continuar trabajo local independiente. Ante duda de contrato, no construir comportamiento incompatible para avanzar más rápido.

## Integración del frontend y Swagger

El auxiliar frontend posee apps/web y su handoff. Cliente compartido @fluxone/api-client lo genera el coordinador; exports tipados ServicePaths/ServiceComponents y BrowserPaths/BrowserComponents. APIs privadas configuradas con AUTH_API_URL/PAYMENTS_API_URL/AUDIT_API_URL (base /api/v1). El coordinador no crea ni reformatea apps/web mientras el auxiliar esté activo.

Swagger es responsabilidad del backend: cada servicio sirve /docs y /docs-json con su subconjunto del OpenAPI autoritativo; no regenerar contrato desde decorators como fuente. Frontend no debe crear Swagger alternativo.

Para la iteración de links QR, el auxiliar frontend implementa solamente UI/BFF contra `docs/browser.openapi.yaml`: rutas `/payment-links`, `/payment-links/{id}` y `/pay`, whitelist del proxy, manejo de token en fragmento/memoria y pruebas web. No edita OpenAPI, schemas de evento, documentación central, cliente generado, infraestructura ni payments. Si necesita `qrcode`, lo declara en `apps/web/package.json`, no ejecuta install y registra la solicitud en el handoff. El coordinador regenera `@fluxone/api-client`, instala y verifica integración.

## Backend disponible para integrar

APIs locales: auth http://localhost:3101/api/v1, payments http://localhost:3102/api/v1, audit http://localhost:3103/api/v1. En Compose mantener auth:3001, payments:3002 y audit:3003. Swagger /docs y /docs-json por servicio. @fluxone/api-client ya contiene los exports acordados, generados de contratos. Credenciales demo únicamente en .env raíz, no copiarlas a handoffs.
