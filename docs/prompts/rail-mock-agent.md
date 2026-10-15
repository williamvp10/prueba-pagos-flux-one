# Prompt para el agente auxiliar — riel bancario

Copia el siguiente bloque en otra sesión abierta en la carpeta `prueba-pagos-flux-one` del mismo repositorio. Este prompt no inicia un agente por sí solo.

```text
Vas a implementar el riel bancario simulado del proyecto Flux One. Otro agente coordina el monorepo, pagos, contratos e infraestructura. Compartimos checkout: tu tarea está aislada por rutas, y no debes tocar sus archivos.

Antes de editar:
1. Confirma raíz con git rev-parse --show-toplevel y revisa git status --short.
2. Lee AGENTS.md y docs/collaboration.md. Consulta ./tools/graphify query "rail reversos" --budget 1200 si el grafo existe; no lo reconstruyas. Lee las fuentes devueltas.
3. Lee docs/rail-mock.md, docs/rail.openapi.yaml, los criterios MOCK-01..03 y RAIL/REV relevantes en docs/spec.md y el contrato de integración del mock en docs/collaboration.md.

PROPIEDAD EXCLUSIVA:
- Puedes crear/modificar únicamente apps/rail-mock/** y docs/handoffs/rail-mock.md.
- No modifiques raíz, otros servicios, contracts, specs centrales, .env, infra, Compose, lockfiles, tools ni graphify-out.
- No ejecutes git add/commit/stash/reset/clean/checkout, installs del workspace, generación global ni formato fuera de tus rutas. El coordinador instala e integra. No inicies subagentes sobre otras partes del repo.
- Si necesitas cambiar un contrato, propón el cambio en el handoff; no lo hagas unilateralmente.

IMPLEMENTACIÓN:
- Servicio standalone TypeScript/Node 24 LTS, paquete @fluxone/rail-mock; módulos nativos node:http, node:sqlite y node:test, sin dependencias runtime externas.
- Servidor en 0.0.0.0:3004, configurable PORT; app factory separada de startup para tests con puerto efímero/cierre limpio.
- Implementa exactamente los tres endpoints bancarios de rail.openapi.yaml: POST /rail/transfers, GET /rail/transfers/{reference}, POST /rail/reversals. Puedes añadir /health/ready interno con el contrato de salud documentado.
- Configuración por environment: RAIL_MODE=random|test, RAIL_SCENARIOS, RAIL_DB_PATH=/data/rail.sqlite y NODE_ENV. Sin .env propio.
- UUID reference estable e idempotente globalmente entre tipos; hash de payload normalizado; mismo contenido repite resultado, distinto 409. Montos string COP, cálculos exactos y validación sin float. Validación malformada 400; rechazo bancario válido 422 con resultado persistido.
- SQLite persistente con unique reference y transacciones. Datos persisten al reiniciar. No consultar esquemas ni saldo de payments.
- Escenarios: accepted=200 ACCEPTED; rejected=422 REJECTED; unavailable=503 sin procesar; timeout_processed=aceptar/persistir y responder a los 12s; timeout_not_processed=esperar 12s sin procesar y responder 503 si hay conexión. Cliente payments tiene timeout 10s.
- Random con 20% por escenario. Tests fuerzan secuencia al arrancar; replay no consume secuencia y al agotarse usa accepted. Sin control remoto/header público de escenarios.
- Reversos completos solo de original ACCEPTED, máximo uno exitoso, incluso con referencias concurrentes. GET original incluye último resultado de reverso o null. Persistir validación y compensación de forma atómica. Rechazos previos no equivalen a éxito de un nuevo intento.
- Catálogo externo EXT-001 y EXT-002. Respeta status, campos y reason nullable del contrato. No agregues GET de reversals.
- Incluye package.json, tsconfig local, scripts build/start/test, Dockerfile y README propio con comandos reales. No asumas que ya existe tsconfig raíz. No dejes endpoints que devuelvan siempre éxito ni TODOs en el core.

VERIFICACIÓN Y ENTREGA:
- Tests node:test con SQLite temporal y puertos efímeros: contrato, replay/payload conflict, concurrencia, persistencia tras reabrir, cinco escenarios, reverso repetido y monto/original inválido. Mantén al menos un test de demora real >10s; usa control de reloj para el resto si hace falta.
- Ejecuta lo que permita el entorno sin modificar dependencias/lockfile raíz. Node 24 soporta TS compatible con type stripping: evita sintaxis no soportada en esa vía. Si build requiere devDependencies, decláralas y solicita instalación al coordinador sin inventar resultados.
- Actualiza solo docs/handoffs/rail-mock.md: READY_FOR_REVIEW o BLOCKED, rutas creadas, criterios/test paths, comandos exactos y resultados, dependencias solicitadas, variables/volumen y limitaciones. No actualices traceability/ai-log/README centrales.
- Termina con un resumen del handoff. No hagas commit ni empieces otro servicio: espera revisión y nueva asignación.
```
