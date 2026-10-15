# Guía para sustentar Flux One

Esta guía sirve para explicar el sistema desde el problema hasta el código. La meta no es recitar patrones: es mostrar cómo una decisión protege una regla concreta del producto.

## Presentación de 60–90 segundos

> Flux One es una demo de transferencias en COP con transferencias internas entre cuentas y externas contra un riel bancario simulado. El repositorio es un monorepo, pero Auth, Payments y Audit corren como servicios NestJS separados y son dueños de sus propios datos. Payments mantiene saldos en centavos, reserva fondos antes de llamar al banco y usa una referencia e idempotencia persistentes para recuperarse de timeouts sin duplicar débitos. Los eventos se escriben junto con la operación en un outbox y luego se entregan por RabbitMQ a Audit. Next.js ofrece el portal y un BFF que protege la sesión con cookies HttpOnly. OpenAPI define los contratos. Docker Compose reúne los servicios y Dokploy publica el portal. Es una prueba técnica: el banco es simulado y todavía hay pruebas de navegador y algunos escenarios de recuperación pendientes.

Si te interrumpen, vuelve a tres ideas: **propiedad de datos por servicio, seguridad financiera en Payments y recuperación idempotente ante resultados bancarios inciertos**.

## Cómo explicar la arquitectura hexagonal

La arquitectura hexagonal separa las reglas del negocio de las tecnologías de entrada y salida. El dominio y los casos de uso expresan qué debe hacer Payments; HTTP, PostgreSQL, RabbitMQ y el banco son adaptadores que permiten hablar con el mundo exterior.

En este repo, el recorrido por capas de Payments es:

| Capa | Ejemplos | Qué hace |
|---|---|---|
| Dominio | `apps/payments/src/domain/money.ts`, `ports.ts` | Reglas puras de dinero, estados y puertos como `Transaction` y `BankRail` |
| Aplicación | `apps/payments/src/application/payments.ts`, `reconcile.ts` | Casos de uso y transiciones financieras sin conocer NestJS ni TypeORM |
| Infraestructura | `apps/payments/src/infrastructure/http.ts`, `store.ts`, `bank.ts`, `workers.ts` | Controllers HTTP, persistencia PostgreSQL/TypeORM, cliente del riel y workers |
| Bootstrap | `apps/payments/src/bootstrap/main.ts` | Une adapters y casos de uso mediante inyección de dependencias y arranca NestJS |

**Forma corta de defender la dirección de dependencias:** `Payments` usa el puerto `UnitOfWork`; `PgUnitOfWork` implementa ese puerto. La lógica no importa la clase de PostgreSQL. Así se pueden probar decisiones con un `Transaction` controlado y probar persistencia/locks con PostgreSQL real.

No afirmes que TypeORM resuelve por sí solo la arquitectura. TypeORM se limita a adapters/bootstrap; algunas operaciones críticas usan SQL explícito para que locks, constraints y transacciones sean visibles.

## Microservicios: qué está separado

- **Auth** es dueño de identidades, hashes de contraseña y sesiones en `auth_schema`.
- **Payments** es dueño de cuentas, reservas, transferencias, reversos, ledger, idempotencia y outbox en `payment_schema`.
- **Audit** consume y consulta eventos en `audit_schema`.
- **Web** sirve la UI Next.js y el BFF. No posee tablas financieras.
- **Rail mock** simula el banco externo y persiste su propio resultado en SQLite. Es un servicio de soporte, no uno de los tres dominios centrales.

Corren como procesos/servicios separados y se comunican por HTTP o AMQP. Es un monorepo para simplificar desarrollo y entrega; compartir repositorio no significa compartir tablas o lógica de dominio. Auth, Payments y Audit usan la misma instancia PostgreSQL con esquemas y roles limitados por servicio: hay aislamiento de acceso a datos, no tres clústeres físicos independientes. Esa elección reduce operación y costos para la prueba, con menos aislamiento de infraestructura que bases completamente separadas.

**Si preguntan por el costo de microservicios:** hay más despliegue, red, observabilidad y fallos parciales que en un monolito. Para esta prueba se separaron dominios y ownership de datos como requisito arquitectónico; no se afirma que tres servicios sean automáticamente mejores para cualquier producto.

## Recorrido de una transferencia externa

1. El navegador envía la intención al BFF con su sesión y una `Idempotency-Key`.
2. El BFF valida que la ruta esté permitida, comprueba `Origin` en mutaciones y reenvía al servicio privado con el JWT guardado en cookie HttpOnly.
3. Payments valida el contrato, reclama la key en PostgreSQL, verifica saldo disponible y registra transferencia `PENDING`, reserva y evento outbox en una transacción. Devuelve `202`: eso significa “aceptada para procesar”, no “el banco ya la completó”.
4. Un worker reclama trabajo durable con lease y llama al riel con una `bankRef` estable. No mantiene abierta una transacción SQL mientras hace HTTP.
5. Al confirmar el banco, Payments descuenta balance y reserva, agrega el ledger, marca `COMPLETED` y escribe el evento en el outbox, todo en otra transacción.
6. Si el banco rechaza, Payments libera la reserva y marca `FAILED`, sin débito. Si recibe 503 que declara que no hubo procesamiento, queda `PENDING` para reintento. Si el resultado es incierto por timeout o respuesta inválida, queda `UNKNOWN` y conserva la reserva.
7. En `UNKNOWN`, el worker consulta primero al banco por la misma referencia. Si no encuentra operación, reenvía con la misma referencia idempotente. No genera una referencia nueva para “probar otra vez”.
8. El publicador de outbox entrega eventos a RabbitMQ. Audit los persiste y los expone solo después de comprobar autorización con Payments.

En la pantalla, `PENDING` significa que falta un intento o reintento; `UNKNOWN` significa que no sabemos aún si el banco procesó la operación. Ninguno significa “fallida”. No se debe iniciar otra transferencia para sustituir una `UNKNOWN`.

**Modo del riel desplegado:** la configuración `.env.dokploy` revisada tiene `RAIL_MODE=random`. En ese modo el mock puede aceptar, rechazar, quedar no disponible o simular timeouts; `RAIL_SCENARIOS=accepted` solo controla escenarios cuando el modo es `test`. Esto explica que una operación demo pueda mostrar varios pasos antes de terminar. No es una conexión a bancos reales.

## Cómo defendemos el dinero e idempotencia

- El monto cruza la API como texto decimal, por ejemplo `"1250.25"`; el dominio lo convierte a `bigint` en centavos. No se usa `float`/`Number` para aritmética monetaria.
- Disponible es `balance - reserved`. Una transferencia externa reserva fondos antes de salir del sistema, así otra operación no puede gastar el mismo dinero.
- El ledger es inmutable. Un reverso no borra ni edita el movimiento original: agrega un asiento compensatorio.
- La key se guarda en DB con sujeto, operación, hash semántico y respuesta. Misma key y mismo payload reproduce la respuesta original; misma key con contenido diferente responde conflicto.
- `bankRef` es distinta de la key HTTP del cliente y permanece estable entre intentos al simulador. Ambas identifican operaciones en límites diferentes.
- La transacción local hace atómicos estado, saldos/reserva, ledger, outbox y snapshot idempotente. Las llamadas HTTP/AMQP ocurren fuera de la transacción financiera.

**No prometemos “exactly once” en la red.** Outbox y RabbitMQ entregan al menos una vez; `eventId` único/deduplicación hace que repetir un mensaje no repita su efecto persistido. La garantía buscada es un único efecto financiero, no un único envío de paquetes.

## Por qué RabbitMQ, outbox y Audit

RabbitMQ es suficiente para el flujo de eventos de esta demo: una cola durable, consumo asíncrono y redelivery. Kafka sería más útil si necesitáramos streams de alto volumen, varios consumidores releyendo históricos o analítica de eventos; añadirlo aquí aumentaría la operación sin resolver una necesidad actual.

El outbox resuelve la brecha entre “el pago hizo commit” y “el broker estaba disponible”. Payments guarda el evento en la misma transacción que el pago; un worker lo publica con mensajes persistentes y publisher confirms. Si la confirmación se pierde, puede volver a publicar el mismo `eventId`. Audit confirma después de persistir, y deduplica. Esto da entrega confiable y eventual, no transacción distribuida.

Audit no lee `payment_schema`. Para consultar auditoría, valida acceso preguntando a Payments por la transferencia con el JWT del usuario. Si Payments no está disponible, falla cerrado; si el usuario no participa, no revela que la transferencia exista. El tradeoff es que lectura de auditoría depende de Payments.

## API First y BFF

- `docs/openapi.yaml`: contratos de APIs privadas Auth/Payments/Audit.
- `docs/browser.openapi.yaml`: contrato entre navegador y BFF.
- `docs/rail.openapi.yaml`: contrato entre Payments y los tres endpoints del riel simulado.
- `docs/contracts/audit-event.v1.schema.json`: contrato de eventos.
- `packages/api-client`: tipos generados de OpenAPI; no contiene entidades TypeORM.
- Swagger `/docs` y `/docs-json` permite explorar cada servicio con el contrato acordado.

El BFF crea una frontera de mismo origen: el navegador no guarda JWT en localStorage; recibe cookies HttpOnly/Secure/SameSite y el servidor las usa para las llamadas internas. El BFF valida `Origin` para mutaciones y permite solo rutas explícitas. Es menos superficie de token expuesto al JavaScript del navegador, aunque aún requiere revisar CSRF, XSS, configuración de cookies y políticas de origen como parte de una auditoría completa.

## Cómo leer el repositorio durante la sustentación

Orden sugerido para una lectura corta:

1. `README.md`: qué entrega, cómo levantarlo y qué límites tiene.
2. `docs/spec.md`: reglas y criterios de aceptación.
3. `docs/architecture.md`: límites de servicios, capas y flujo externo.
4. `docs/data-model.md`: propiedad, centavos, idempotencia y recuperación.
5. `docs/openapi.yaml`, `browser.openapi.yaml`, `rail.openapi.yaml`: contratos por frontera.
6. `apps/payments/src/application/payments.ts`: creación de transferencias, reversos e idempotencia.
7. `apps/payments/src/application/reconcile.ts`: resultado del banco y transiciones.
8. `apps/payments/src/infrastructure/store.ts`: unit of work, SQL, locks y repositorios.
9. `apps/payments/src/infrastructure/workers.ts` y `bank.ts`: leases, polling, consulta/reintento y HTTP al riel.
10. `apps/rail-mock/src/rail.ts`: contrato, SQLite, referencia idempotente y escenarios del simulador.
11. `apps/audit/src/`: persistencia/consumo/consulta autorizada; `apps/web/src/app/api/v1/[...path]/route.ts`: BFF.
12. `docker-compose.yml`: cómo se conectan y aíslan los servicios en ejecución.

Para una regla, empieza en el criterio con ID de `docs/spec.md`, localiza su test en `docs/traceability.md`, sigue el caso de uso y después abre el adapter. No empieces leyendo todos los controllers ni todo el repo.

## Demo oral en cinco minutos

1. Explica la separación entre Web, Auth, Payments, Audit y rail-mock usando `docs/architecture.md`.
2. Inicia sesión y muestra una cuenta. Explica que cada usuario demo tiene una sola cuenta.
3. Haz una transferencia interna: es local y atómica; no necesita esperar al banco externo.
4. Haz una externa: muestra `PENDING` y, si llega a ocurrir, `UNKNOWN`. Explica que el dinero está reservado y que el worker concilia automáticamente.
5. Abre el detalle: identifica eventos de auditoría y estado final. Aclara que el historial puede ser eventual porque RabbitMQ/Audit es asíncrono.
6. Muestra Swagger o contratos y señala un test relevante: `apps/payments/src/application/reconcile.spec.ts` o `tests/backend.test.cjs`.

No ejecutes reversos en producción sin revisar antes el monto y la cuenta; para la sustentación es más seguro usar entorno local o hacer una operación externa demo pequeña.

## Preguntas probables y respuestas defendibles

### ¿Por qué separar microservicios si es una app pequeña?

Auth, pagos y auditoría tienen responsabilidades y datos distintos. La prueba pide esa separación y el diseño mantiene ownership explícito. Reconozco el costo operativo; para un MVP real podría comenzar con un monolito modular y separar procesos cuando haya razón de escalado/equipos.

### ¿Las bases están físicamente separadas?

No. Hay una instancia PostgreSQL con esquemas y roles separados para los tres servicios. Cada servicio tiene sus propias credenciales y no debería consultar el esquema ajeno. Es aislamiento lógico y de permisos para esta demo; bases/clústeres independientes darían mayor aislamiento operacional.

### ¿Qué evita dos débitos por doble clic o reintento?

La `Idempotency-Key` del cliente se reclama en DB con unicidad por sujeto y tipo de operación. El mismo payload obtiene el resultado guardado; otro payload con esa key se rechaza. Para el banco usamos aparte una referencia persistente e idempotente. Las constraints y locks de PostgreSQL resuelven carreras entre procesos.

### ¿Por qué devolver 202 para una externa?

El servicio aceptó la solicitud y persistió la reserva, pero el banco aún puede aceptarla, rechazarla o no responder. `202` evita presentar el envío como liquidación final.

### ¿Qué pasa si el banco procesó el pago pero se perdió la respuesta?

Payments conserva la reserva y marca `UNKNOWN`. Consulta por la misma referencia estable. Si el banco la procesó, aplica el resultado; si confirma que no existe, reenvía con esa misma referencia. Nunca libera fondos solo por un timeout.

### ¿Qué atomicidad garantizan?

En PostgreSQL, monto/reserva, ledger, estado, outbox y resultado de idempotencia se comprometen juntos. La llamada al banco y publicación AMQP son externas y ocurren fuera de esa transacción. El outbox y la conciliación completan esas fronteras con reintentos idempotentes.

### ¿Por qué no guardar auditoría dentro del servicio de pagos?

Payments escribe el outbox en su propia transacción, pero Audit es dueño de su almacenamiento y consume de manera asíncrona. Así una caída del broker no hace perder el evento ni bloquea innecesariamente el pago.

### ¿Qué diferencia hay entre `PENDING`, `PROCESSING` y `UNKNOWN`?

`PENDING`: trabajo listo para intento/reintento. `PROCESSING`: worker reclamó la operación. `UNKNOWN`: el resultado externo es ambiguo y requiere conciliación. `COMPLETED` y `FAILED` son terminales para el pago; `REVERSED` indica compensación confirmada.

### ¿Cómo prueban la lógica?

Se usa el runner nativo `node:test` y `node:assert/strict`. La suite completa más reciente pasó: Payments 13 unitarias + 13 de integración/configuración; rail-mock 8; frontend 3 unitarias de montos; typecheck y build Next.js. PostgreSQL/RabbitMQ reales se usan en las pruebas que verifican DB y broker. Los unitarios de `reconcile.ts` usan un `Transaction` controlado. Aún faltan pruebas automatizadas de navegador y algunos escenarios de crash/reverso.

### ¿Es una solución de producción bancaria?

No. Es una demo funcional desplegada en una VPS, con riel simulado, datos ficticios y sin auditoría independiente de seguridad, alta disponibilidad, backups/restore probados, monitoreo operativo completo ni carga certificada. Esa respuesta muestra alcance honesto.

## Errores que conviene evitar en la explicación

- No digas que RabbitMQ garantiza exactly-once; el diseño espera al menos una entrega y deduplica.
- No digas que `202` significa dinero recibido por el otro banco.
- No digas que `UNKNOWN` es un rechazo, ni que se libera la reserva.
- No digas que hay tres instancias físicas de PostgreSQL: son esquemas/roles en una instancia.
- No llames a rail-mock un banco real ni confundas su SQLite con la DB de Payments.
- No presentes el BFF como un gateway independiente: es una ruta del mismo Next.js.
- No afirmes cobertura completa de navegador o crash recovery. La matriz tiene pendientes explícitos.

## Fuentes principales

- [Spec funcional](spec.md)
- [Arquitectura hexagonal](architecture.md)
- [Modelo de datos](data-model.md)
- [Contratos](contracts/README.md)
- [Eventos y outbox](events.md)
- [Trazabilidad de pruebas](traceability.md)
- [Verificación](verification.md)
- [Despliegue](deployment.md)
