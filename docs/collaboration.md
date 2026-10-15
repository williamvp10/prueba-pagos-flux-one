# Coordinación de implementación

## Estrategia: dos frentes, un integrador

Mismo repositorio y checkout, con propiedad exclusiva por rutas. Main sigue siendo trunk; el agente auxiliar no toca índice ni rama. El coordinador integra entregas terminadas con commits pequeños por bloque. Esto evita conflictos de lockfile, staging, contratos y formato global.

| Frente | Propietario | Rutas | Estado |
|---|---|---|---|
| Tooling/contexto y coordinación | Chat coordinador | AGENTS.md, tools/**, .codex/**, docs centrales | Graphify y reglas implementados; evidencia en docs/verification.md |
| Monorepo e infraestructura | Chat coordinador | manifests raíz, lockfile, infra/**, Compose, .env.example | Pendiente de bootstrap |
| Pagos y contratos compartidos | Chat coordinador | apps/payments/**, packages/**, contratos y specs | Pendiente de implementación |
| Mock bancario | Agente auxiliar externo | apps/rail-mock/** y docs/handoffs/rail-mock.md | RESERVADO; prompt listo, no iniciado desde este chat |
| Auth, audit y frontend | Sin tarea auxiliar asignada | apps/auth/**, apps/audit/**, apps/web/** | Coordinador reasigna después del mock; no empezar en paralelo por iniciativa propia |

El estado de esta tabla es una asignación, no evidencia de procesos en ejecución. Solo cambia el coordinador. La sesión iniciada por el usuario con el prompt será responsable del mock; no se ha despachado un agente duplicado automáticamente.

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
