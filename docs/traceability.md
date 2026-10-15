# Trazabilidad y paquete de pruebas backend

## Estrategia

Paquete principal: coverage-plan; secundario: contract-and-api-checks. Riesgos principales: doble débito, sobregiro, pérdida de reserva/evento y exposición de recursos ajenos. Las filas indican evidencia completa, parcial o pendiente; `pnpm test:all` verifica backend, rail y build/typecheck/unitarias del web.

| Capa | Dependencias | Evidencia que debe producir |
|---|---|---|
| Unit | dominio puro, reloj/IDs controlados | dinero exacto, invariantes, transiciones |
| Integration | PostgreSQL real; RabbitMQ real cuando aplica; SQLite real para mock | locks, constraints, rollback, leases, ack/redelivery y persistencia |
| Contract | OpenAPI + JSON Schema + servidor implementado | status, headers y payloads reales compatibles |
| Acceptance | servicios + PostgreSQL/RabbitMQ reales + mock determinista | escenarios del core con recuperación y fallos |
| Browser | sistema local y Playwright | journeys mínimos y estados de UI |
| Smoke/review | Compose y revisión de historial/config | arranque reproducible, redes, secretos y SDD |

No sustituir PostgreSQL por SQLite/in-memory para pruebas de concurrencia. SQLite solo corresponde al mock. Mocks HTTP son adecuados en unit de adaptadores, pero no prueban compatibilidad ni fallos entre procesos.

## Fixtures, aislamiento y ejecución

- Base efímera por suite/workflow, identificador único por worker y esquemas/DB separados cuando hay paralelismo. No resetear la DB de demo.
- Seeds de cuentas/emails/códigos constantes dentro de cada entorno; user UUIDs fijos de tests, tiempo controlado y claves únicas por caso.
- Limpiar entre casos de integración porque workers usan conexiones propias: rollback del proceso de test no aisla esas escrituras.
- Configurar mock con secuencia de escenarios, no random. Barreras para concurrencia y polling con deadline para eventualidad; evitar sleeps arbitrarios.
- Timeout real: una prueba HTTP completa de 10/12 s para demostrar integración; resto usa reloj/control de adaptador sin cambiar la regla de producción.
- Inyectar fallos antes/después de commits y confirms con hooks habilitados exclusivamente en test; no endpoint de control público.
- Capturar requestId, transferId, bankReference, eventId, secuencias, saldos, reservas y movimientos; nunca tokens/passwords.
- Local rápido: unit + lint/types + validación de contratos. CI de cada push a main: añadir integración/contrato/aceptación del core. Cierre: browser smoke y Compose limpio. No inventar nightly para esta prueba de tres horas.
- Tests se nombran `[ID] descripción`; una fila solo pasa a VERIFICADO con archivo real y comando/resultado registrado. No confundir el test planeado con un test existente.

## Matriz

| Criterio | Caso | Capa prevista | Test planeado | Estado / evidencia |
|---|---|---|---|---|
| AUTH-01 | Registro y cuenta propia | integration | `tests/backend.test.cjs` + smoke Compose/BFF | PARCIAL; registro/bootstrap API y BFF de login/cuentas comprobados; browser completo pendiente |
| AUTH-02 | Credenciales inválidas | integration | `auth-02.integration.spec.ts` | PENDIENTE; sin implementación |
| AUTH-03 | Identidad duplicada | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| AUTH-04 | Acceso protegido | integration | `tests/backend.test.cjs`| PARCIAL; JWT ausente probado; falta expirado/alterado |
| AUTH-05 | Propiedad | integration | `tests/backend.test.cjs`| PARCIAL; débito y auditoría ajenos probados; completar demás rutas |
| AUTH-06 | Rotación y reutilización | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| AUTH-07 | Logout y expiración | integration | `tests/backend.test.cjs`| PARCIAL; logout probado; expiración temporal pendiente |
| AUTH-08 | Protección de entrada | integration | `auth-08.integration.spec.ts` | PENDIENTE; sin implementación |
| AUTH-09 | Bootstrap recuperable | acceptance | `auth-09.acceptance.spec.ts` | PENDIENTE; sin implementación |
| PAY-01 | Interna exitosa | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| PAY-02 | Importe inválido | unit | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| PAY-03 | Sin fondos | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| PAY-04 | Origen y destino | integration | `tests/backend.test.cjs`| PARCIAL; misma cuenta probada; ampliar inexistentes |
| PAY-05 | Concurrencia sobre saldo | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| PAY-06 | Exactitud decimal | unit | `tests/backend.test.cjs`| PARCIAL; aritmética exacta unitaria; ampliar compensación decimal HTTP |
| PAY-07 | Saldo y catálogo | integration | `tests/backend.test.cjs`| PARCIAL; saldos API usados en tests; catálogo pendiente de aceptación |
| PAY-08 | Historial | integration | `tests/backend.test.cjs`| PARCIAL; cursor y filtros probados; ampliar exclusión de usuarios |
| PAY-09 | Desborde del destinatario | integration | `tests/backend.test.cjs`| PARCIAL; guard unitario; falta rollback DB por overflow |
| IDEM-01 | Replay exacto | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| IDEM-02 | Payload distinto | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| IDEM-03 | Carrera de misma key | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| IDEM-04 | Header obligatorio | contract | `tests/backend.test.cjs`| PARCIAL; header ausente probado; ampliar longitud/caracteres |
| IDEM-05 | Caída antes de commit | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| IDEM-06 | Caída después de commit | integration | `idem-06.integration.spec.ts` | PENDIENTE; sin implementación |
| IDEM-07 | Error de negocio consumido | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| RAIL-01 | Banco acepta | acceptance | `tests/backend.test.cjs` + smoke Compose/BFF | VERIFICADO; flujo completo payments → rail-mock → BFF aceptado |
| RAIL-02 | Banco rechaza | acceptance | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` (proveedor HTTP de prueba; integración mock auxiliar pendiente) |
| RAIL-03 | Banco no disponible | acceptance | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` (proveedor HTTP de prueba; integración mock auxiliar pendiente) |
| RAIL-04 | Timeout procesado | acceptance | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` (proveedor HTTP de prueba; integración mock auxiliar pendiente) |
| RAIL-05 | Timeout no procesado | acceptance | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` (proveedor HTTP de prueba; integración mock auxiliar pendiente) |
| RAIL-06 | Consulta indisponible | acceptance | `rail-06.acceptance.spec.ts` | PENDIENTE; sin implementación |
| RAIL-07 | Worker reiniciado | acceptance | `rail-07.acceptance.spec.ts` | PENDIENTE; sin implementación |
| RAIL-08 | Respuesta inesperada | contract | `rail-08.contract.spec.ts` | PENDIENTE; sin implementación |
| MOCK-01 | Contrato e idempotencia bancaria | integration | `apps/rail-mock/src/rail.test.ts` | VERIFICADO; `pnpm test:all` (8 pruebas rail) |
| MOCK-02 | Persistencia bancaria | integration | `apps/rail-mock/src/rail.test.ts` | VERIFICADO; SQLite reabierta conserva transferencia y reverso |
| MOCK-03 | Modos de fallo | contract | `apps/rail-mock/src/rail.test.ts` | VERIFICADO; aceptada, rechazada, 503 y ambos timeouts |
| REV-01 | Interno exitoso | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| REV-02 | Sin saldo para devolver | integration | `rev-02.integration.spec.ts` | PENDIENTE; sin implementación |
| REV-03 | Estado incompatible | integration | `tests/backend.test.cjs`| PARCIAL; ya reversada probado; ampliar demás estados |
| REV-04 | Carrera de reversos | integration | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| REV-05 | Reverso externo aceptado | acceptance | `tests/backend.test.cjs` + smoke Compose/BFF | VERIFICADO; backend y rail-mock confirmaron el reverso; auditoría emitió cuatro eventos |
| REV-06 | Reverso externo rechazado | acceptance | `tests/backend.test.cjs`| PARCIAL; implementado; falta test de rechazo del reverso |
| REV-07 | Reverso externo indisponible | acceptance | `tests/backend.test.cjs`| PARCIAL; implementado; falta test de 503 del reverso |
| REV-08 | Reverso externo ambiguo | acceptance | `tests/backend.test.cjs`| PARCIAL; implementado; falta timeout específico de reverso |
| REV-09 | Permiso y monto del reverso | contract | `rev-09.contract.spec.ts` | PENDIENTE; sin implementación |
| AUD-01 | Eventos completos | acceptance | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |
| AUD-02 | Broker caído | acceptance | `aud-02.acceptance.spec.ts` | PENDIENTE; sin implementación |
| AUD-03 | Publicación ambigua | acceptance | `tests/backend.test.cjs`| PARCIAL; deduplicación probada; falta caída entre confirm y update |
| AUD-04 | Consumidor reiniciado | acceptance | `tests/backend.test.cjs`| PARCIAL; deduplicación probada; falta reinicio antes de ack |
| AUD-05 | Fuera de orden | integration | `aud-05.integration.spec.ts` | PENDIENTE; sin implementación |
| AUD-06 | Mensaje inválido | integration | `aud-06.integration.spec.ts` | PENDIENTE; sin implementación |
| AUD-07 | Autorización de consulta | integration | `tests/backend.test.cjs` + smoke Compose/BFF | PARCIAL; permiso y lectura integrada comprobados; falta simular caída de payments |
| AUD-08 | Aislamiento SQL | integration | `tests/backend.test.cjs`| PARCIAL; tres denegaciones cruzadas probadas; ampliar combinaciones |
| UI-01 | Doble clic y reintento | browser | `ui-01.browser.spec.ts` | PENDIENTE; sin implementación |
| UI-02 | Seguimiento | browser | `ui-02.browser.spec.ts` | PENDIENTE; sin implementación |
| UI-03 | Auditoría eventual | browser | `ui-03.browser.spec.ts` | PENDIENTE; sin implementación |
| UI-04 | Tema y accesibilidad | browser | `ui-04.browser.spec.ts` | PENDIENTE; sin implementación |
| UI-05 | Sesión expirada | browser | `ui-05.browser.spec.ts` | PENDIENTE; sin implementación |
| OPS-01 | Arranque limpio | smoke | `docker compose up --build -d --wait` | VERIFICADO; todos los servicios healthy en proyecto aislado |
| OPS-02 | Secretos y redes | smoke | `tests/infrastructure.test.cjs` + smoke Compose/BFF | PARCIAL; permisos/red privada y cookies BFF comprobados; falta auditoría completa de despliegue |
| SDD-01 | Contrato primero | review | `sdd-01.review.spec.ts` | PENDIENTE; sin implementación |
| API-01 | Swagger por servicio | contract | `tests/backend.test.cjs`| VERIFICADO backend; `pnpm test` |

## Evidencia ejecutable actual

`pnpm test`: 3 unitarias + 13 integración/configuración, todas aprobadas. Se validan los responses HTTP de la suite contra OpenAPI. `IDEM-05` además se ejecutó aislado con trigger que falla en transfer.completed, después de escribir los movimientos, para demostrar rollback real de dinero/outbox/key. Los nombres antiguos de pruebas planeadas en filas pendientes no son archivos existentes.

API-01 cubre UI/JSON Swagger de los tres servicios. Los tests bancarios usan un proveedor controlado de test; MOCK-01..03 e integración contra el mock de producción permanecen pendientes del auxiliar. Reinicios reales en ventanas de confirm/ack requieren pruebas adicionales aunque la deduplicación ya esté verificada.
