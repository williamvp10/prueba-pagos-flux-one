# Trazabilidad y paquete de pruebas backend

## Estrategia

Paquete principal: coverage-plan; secundario: contract-and-api-checks. Riesgos principales: doble débito, sobregiro, pérdida de reserva/evento y exposición de recursos ajenos. No existe cobertura ejecutable todavía.

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
| AUTH-01 | Registro y cuenta propia | integration | `auth-01.integration.spec.ts` | PENDIENTE; sin implementación |
| AUTH-02 | Credenciales inválidas | integration | `auth-02.integration.spec.ts` | PENDIENTE; sin implementación |
| AUTH-03 | Identidad duplicada | integration | `auth-03.integration.spec.ts` | PENDIENTE; sin implementación |
| AUTH-04 | Acceso protegido | integration | `auth-04.integration.spec.ts` | PENDIENTE; sin implementación |
| AUTH-05 | Propiedad | integration | `auth-05.integration.spec.ts` | PENDIENTE; sin implementación |
| AUTH-06 | Rotación y reutilización | integration | `auth-06.integration.spec.ts` | PENDIENTE; sin implementación |
| AUTH-07 | Logout y expiración | integration | `auth-07.integration.spec.ts` | PENDIENTE; sin implementación |
| AUTH-08 | Protección de entrada | integration | `auth-08.integration.spec.ts` | PENDIENTE; sin implementación |
| AUTH-09 | Bootstrap recuperable | acceptance | `auth-09.acceptance.spec.ts` | PENDIENTE; sin implementación |
| PAY-01 | Interna exitosa | integration | `pay-01.integration.spec.ts` | PENDIENTE; sin implementación |
| PAY-02 | Importe inválido | unit | `pay-02.unit.spec.ts` | PENDIENTE; sin implementación |
| PAY-03 | Sin fondos | integration | `pay-03.integration.spec.ts` | PENDIENTE; sin implementación |
| PAY-04 | Origen y destino | integration | `pay-04.integration.spec.ts` | PENDIENTE; sin implementación |
| PAY-05 | Concurrencia sobre saldo | integration | `pay-05.integration.spec.ts` | PENDIENTE; sin implementación |
| PAY-06 | Exactitud decimal | unit | `pay-06.unit.spec.ts` | PENDIENTE; sin implementación |
| PAY-07 | Saldo y catálogo | integration | `pay-07.integration.spec.ts` | PENDIENTE; sin implementación |
| PAY-08 | Historial | integration | `pay-08.integration.spec.ts` | PENDIENTE; sin implementación |
| PAY-09 | Desborde del destinatario | integration | `pay-09.integration.spec.ts` | PENDIENTE; sin implementación |
| IDEM-01 | Replay exacto | integration | `idem-01.integration.spec.ts` | PENDIENTE; sin implementación |
| IDEM-02 | Payload distinto | integration | `idem-02.integration.spec.ts` | PENDIENTE; sin implementación |
| IDEM-03 | Carrera de misma key | integration | `idem-03.integration.spec.ts` | PENDIENTE; sin implementación |
| IDEM-04 | Header obligatorio | contract | `idem-04.contract.spec.ts` | PENDIENTE; sin implementación |
| IDEM-05 | Caída antes de commit | integration | `idem-05.integration.spec.ts` | PENDIENTE; sin implementación |
| IDEM-06 | Caída después de commit | integration | `idem-06.integration.spec.ts` | PENDIENTE; sin implementación |
| IDEM-07 | Error de negocio consumido | integration | `idem-07.integration.spec.ts` | PENDIENTE; sin implementación |
| RAIL-01 | Banco acepta | acceptance | `rail-01.acceptance.spec.ts` | PENDIENTE; sin implementación |
| RAIL-02 | Banco rechaza | acceptance | `rail-02.acceptance.spec.ts` | PENDIENTE; sin implementación |
| RAIL-03 | Banco no disponible | acceptance | `rail-03.acceptance.spec.ts` | PENDIENTE; sin implementación |
| RAIL-04 | Timeout procesado | acceptance | `rail-04.acceptance.spec.ts` | PENDIENTE; sin implementación |
| RAIL-05 | Timeout no procesado | acceptance | `rail-05.acceptance.spec.ts` | PENDIENTE; sin implementación |
| RAIL-06 | Consulta indisponible | acceptance | `rail-06.acceptance.spec.ts` | PENDIENTE; sin implementación |
| RAIL-07 | Worker reiniciado | acceptance | `rail-07.acceptance.spec.ts` | PENDIENTE; sin implementación |
| RAIL-08 | Respuesta inesperada | contract | `rail-08.contract.spec.ts` | PENDIENTE; sin implementación |
| MOCK-01 | Contrato e idempotencia bancaria | integration | `mock-01.integration.spec.ts` | PENDIENTE; sin implementación |
| MOCK-02 | Persistencia bancaria | integration | `mock-02.integration.spec.ts` | PENDIENTE; sin implementación |
| MOCK-03 | Modos de fallo | contract | `mock-03.contract.spec.ts` | PENDIENTE; sin implementación |
| REV-01 | Interno exitoso | integration | `rev-01.integration.spec.ts` | PENDIENTE; sin implementación |
| REV-02 | Sin saldo para devolver | integration | `rev-02.integration.spec.ts` | PENDIENTE; sin implementación |
| REV-03 | Estado incompatible | integration | `rev-03.integration.spec.ts` | PENDIENTE; sin implementación |
| REV-04 | Carrera de reversos | integration | `rev-04.integration.spec.ts` | PENDIENTE; sin implementación |
| REV-05 | Reverso externo aceptado | acceptance | `rev-05.acceptance.spec.ts` | PENDIENTE; sin implementación |
| REV-06 | Reverso externo rechazado | acceptance | `rev-06.acceptance.spec.ts` | PENDIENTE; sin implementación |
| REV-07 | Reverso externo indisponible | acceptance | `rev-07.acceptance.spec.ts` | PENDIENTE; sin implementación |
| REV-08 | Reverso externo ambiguo | acceptance | `rev-08.acceptance.spec.ts` | PENDIENTE; sin implementación |
| REV-09 | Permiso y monto del reverso | contract | `rev-09.contract.spec.ts` | PENDIENTE; sin implementación |
| AUD-01 | Eventos completos | acceptance | `aud-01.acceptance.spec.ts` | PENDIENTE; sin implementación |
| AUD-02 | Broker caído | acceptance | `aud-02.acceptance.spec.ts` | PENDIENTE; sin implementación |
| AUD-03 | Publicación ambigua | acceptance | `aud-03.acceptance.spec.ts` | PENDIENTE; sin implementación |
| AUD-04 | Consumidor reiniciado | acceptance | `aud-04.acceptance.spec.ts` | PENDIENTE; sin implementación |
| AUD-05 | Fuera de orden | integration | `aud-05.integration.spec.ts` | PENDIENTE; sin implementación |
| AUD-06 | Mensaje inválido | integration | `aud-06.integration.spec.ts` | PENDIENTE; sin implementación |
| AUD-07 | Autorización de consulta | integration | `aud-07.integration.spec.ts` | PENDIENTE; sin implementación |
| AUD-08 | Aislamiento SQL | integration | `aud-08.integration.spec.ts` | PENDIENTE; sin implementación |
| UI-01 | Doble clic y reintento | browser | `ui-01.browser.spec.ts` | PENDIENTE; sin implementación |
| UI-02 | Seguimiento | browser | `ui-02.browser.spec.ts` | PENDIENTE; sin implementación |
| UI-03 | Auditoría eventual | browser | `ui-03.browser.spec.ts` | PENDIENTE; sin implementación |
| UI-04 | Tema y accesibilidad | browser | `ui-04.browser.spec.ts` | PENDIENTE; sin implementación |
| UI-05 | Sesión expirada | browser | `ui-05.browser.spec.ts` | PENDIENTE; sin implementación |
| OPS-01 | Arranque limpio | smoke | `ops-01.smoke.spec.ts` | PENDIENTE; sin implementación |
| OPS-02 | Secretos y redes | smoke | `ops-02.smoke.spec.ts` | PENDIENTE; sin implementación |
| SDD-01 | Contrato primero | review | `sdd-01.review.spec.ts` | PENDIENTE; sin implementación |
