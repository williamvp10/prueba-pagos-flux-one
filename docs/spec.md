# Especificación funcional v1

Estado: aprobada para implementación; evidencia pendiente. Fuente: PDF de la prueba y aclaraciones del evaluador transmitidas por el usuario. El mock lo construimos nosotros y elegimos los response bodies respetando la tabla.

## Alcance y vocabulario

- Tres microservicios de negocio, frontend y riel simulado. Sin payment links en v1.
- Transferencia interna: entre cuentas registradas locales; externa: origen local y beneficiario del catálogo bancario mock.
- `balance`: saldo contable; `reserved`: parte comprometida por externas pendientes; `available = balance - reserved`.
- Una solicitud aceptada localmente no significa que el banco haya aceptado. UNKNOWN expresa incertidumbre, no fallo terminal.
- Reverso total, iniciado por propietario del origen, con máximo un reverso activo o exitoso por transferencia.
- Transferencias visibles a propietario del origen y destinatario interno. Auditoría usa el mismo permiso; solo origen puede reversar.

## Semántica transversal

- Auth y sintaxis fallidas no consumen idempotency key. Comandos financieros sintácticamente válidos que llegan a decisión de negocio guardan su resultado definitivo, exitoso o no, en la key.
- Key independiente por subject y tipo de comando; creación de transferencias y creación de reversos son namespaces distintos.
- Replay devuelve respuesta original, aunque el estado actual haya avanzado. Consultar GET para estado vivo.
- No hay cancelación, devolución automática por tiempo ni edición de transferencias.
- Reintentos y conciliación persisten tras reinicio. Error DB aborta sin efectos; fallo banco ambiguo conserva fondos.
- Auditar acciones del core (creación, transiciones y solicitud/resultado de reversos). Auth genera logs de seguridad; no publicar passwords/tokens. Lecturas no generan eventos de transferencia.
- Reserva y transiciones se escriben junto con outbox. Eventos no se descartan por máximo de intentos.

## Criterios Given / When / Then

### Autenticación y autorización

#### AUTH-01 — Registro y cuenta propia

- **Given:** un email nuevo y contraseña válida.
- **When:** se registra y abre su sesión.
- **Then:** auth crea una identidad única; el bootstrap autenticado de payments crea una única cuenta en cero, incluso al repetirse.

#### AUTH-02 — Credenciales inválidas

- **Given:** un email inexistente o contraseña incorrecta.
- **When:** se intenta login.
- **Then:** responde 401 con mensaje genérico, sin sesión ni filtración de existencia.

#### AUTH-03 — Identidad duplicada

- **Given:** un email registrado con variantes de mayúsculas.
- **When:** se registra de nuevo.
- **Then:** responde 409 EMAIL_TAKEN y no duplica la identidad.

#### AUTH-04 — Acceso protegido

- **Given:** JWT ausente, alterado o expirado.
- **When:** se accede a cuentas, pagos o auditoría.
- **Then:** responde 401 sin efectos financieros.

#### AUTH-05 — Propiedad

- **Given:** una cuenta o transferencia ajena.
- **When:** se intenta debitar, reversar o consultar detalle/auditoría sin participación.
- **Then:** responde 404 RESOURCE_NOT_FOUND; listados excluyen recursos ajenos.

#### AUTH-06 — Rotación y reutilización

- **Given:** un refresh vigente.
- **When:** se renueva y después se reutiliza el refresh anterior.
- **Then:** la primera renovación rota atómicamente; la reutilización revoca la familia y responde 401.

#### AUTH-07 — Logout y expiración

- **Given:** una sesión activa.
- **When:** se cierra sesión o expira su refresh.
- **Then:** no puede renovarse; browser elimina cookies. JWT ya emitido vence como máximo en 15 min.

#### AUTH-08 — Protección de entrada

- **Given:** email/password malformados o demasiados intentos.
- **When:** se llama auth.
- **Then:** responde 422 por validación o 429 con Retry-After por rate limit; no guarda secretos en logs.

#### AUTH-09 — Bootstrap recuperable

- **Given:** registro exitoso y payments caído.
- **When:** se abre la UI y luego payments se recupera.
- **Then:** la identidad permanece válida; UI permite reintentar bootstrap sin cuentas duplicadas.

### Dinero y transferencias internas

#### PAY-01 — Interna exitosa entre usuarios

- **Given:** Demo A con ACC-001=1000000.00 y Demo C con ACC-003=0.00.
- **When:** A transfiere 1250.25 a la cuenta de C.
- **Then:** 201 COMPLETED, saldos 998749.75 y 1250.25, dos movimientos y eventos created/completed; la transferencia aparece en los historiales de A y C.

#### PAY-02 — Importe inválido

- **Given:** monto cero, negativo, más de dos decimales, exponencial o fuera de rango.
- **When:** se solicita transferencia.
- **Then:** 422 VALIDATION_ERROR sin débito ni reserva.

#### PAY-03 — Sin fondos

- **Given:** disponible menor al monto.
- **When:** se solicita transferencia válida.
- **Then:** 409 INSUFFICIENT_FUNDS; no crea transferencia ni movimientos y guarda resultado idempotente.

#### PAY-04 — Origen y destino

- **Given:** origen propio y destino inexistente o igual al origen.
- **When:** se solicita transferencia.
- **Then:** 404 RESOURCE_NOT_FOUND o 422 SAME_ACCOUNT respectivamente; sin movimiento.

#### PAY-05 — Concurrencia sobre saldo

- **Given:** ACC-001 con 100.00 disponible.
- **When:** dos claves distintas solicitan simultáneamente 80.00.
- **Then:** solo una completa; la otra falla sin fondos; nunca balance ni disponible negativos.

#### PAY-06 — Exactitud decimal

- **Given:** cuentas con capacidad suficiente.
- **When:** se transfiere y reversa 0.10 y 0.20.
- **Then:** las sumas y compensaciones son exactas en centavos y la API muestra dos decimales.

#### PAY-07 — Saldo y catálogo

- **Given:** usuario autenticado con cuentas propias.
- **When:** consulta saldo y beneficiarios.
- **Then:** recibe balance, reserved y available coherentes; catálogo contiene internas y externas válidas sin datos privados de terceros.

#### PAY-08 — Historial

- **Given:** transferencias de distintos usuarios.
- **When:** lista sus transferencias con cursor y filtros.
- **Then:** solo aparecen aquellas donde es origen o destinatario interno, con orden estable y paginación sin repetición.

#### PAY-09 — Desborde del destinatario

- **Given:** destino con saldo próximo al máximo.
- **When:** se intenta acreditar un monto que supera el límite.
- **Then:** 409 BALANCE_LIMIT_EXCEEDED y rollback de ambos lados.

### Idempotencia y recuperación local

#### IDEM-01 — Replay exacto

- **Given:** un POST ya comprometido.
- **When:** se repite misma key y payload semántico.
- **Then:** devuelve status/body originales y Idempotency-Replayed=true; una sola transferencia, sin nuevo débito.

#### IDEM-02 — Payload distinto

- **Given:** una key consumida.
- **When:** se cambia monto, destino, tipo u operación de transferencia asociada al reverso.
- **Then:** 409 IDEMPOTENCY_CONFLICT sin efectos.

#### IDEM-03 — Carrera de misma key

- **Given:** 20 solicitudes concurrentes con la misma key y payload.
- **When:** se ejecutan contra PostgreSQL real.
- **Then:** todas las respuestas exitosas identifican la misma operación, una reserva/débito y un conjunto de eventos.

#### IDEM-04 — Header obligatorio

- **Given:** header ausente o longitud fuera de 1..128 caracteres permitidos.
- **When:** se crea transferencia o reverso.
- **Then:** 400 IDEMPOTENCY_KEY_REQUIRED o IDEMPOTENCY_KEY_INVALID.

#### IDEM-05 — Caída antes de commit

- **Given:** un fallo después de escribir un débito pero antes del commit.
- **When:** se aborta TX y se reintenta misma key.
- **Then:** rollback completo; el reintento puede ejecutar una vez sin movimiento parcial.

#### IDEM-06 — Caída después de commit

- **Given:** el servidor cae tras commit antes de responder.
- **When:** cliente reintenta misma key.
- **Then:** recupera el resultado original sin repetir efectos.

#### IDEM-07 — Error de negocio consumido

- **Given:** una key con respuesta definitiva INSUFFICIENT_FUNDS guardada.
- **When:** llega dinero y se reintenta con esa misma key.
- **Then:** repite el error original; nueva intención requiere nueva key.

### Riel y transferencias externas

#### RAIL-01 — Banco acepta

- **Given:** origen con disponible y EXT-001 válido.
- **When:** se crea externa y el mock devuelve 200 ACCEPTED.
- **Then:** 202 local con reserva durable y luego COMPLETED; saldo debitado una vez y reserva liberada.

#### RAIL-02 — Banco rechaza

- **Given:** una externa reservada.
- **When:** el mock devuelve 422 REJECTED.
- **Then:** FAILED, reserva liberada, sin débito confirmado y evento de fallo.

#### RAIL-03 — Banco no disponible

- **Given:** una externa reservada.
- **When:** el mock devuelve 503 sin procesar.
- **Then:** permanece PENDING con backoff y misma referencia; dinero reservado hasta resolución.

#### RAIL-04 — Timeout procesado

- **Given:** el mock persiste aceptación y tarda 12 s en responder.
- **When:** el cliente del banco agota 10 s.
- **Then:** UNKNOWN; GET confirma aceptación y completa sin nuevo débito bancario.

#### RAIL-05 — Timeout no procesado

- **Given:** el mock tarda 12 s sin crear operación.
- **When:** cliente agota 10 s y GET devuelve 404.
- **Then:** conserva reserva y reenvía misma referencia; cuando acepta hay un solo débito.

#### RAIL-06 — Consulta indisponible

- **Given:** transferencia UNKNOWN.
- **When:** GET del riel falla, tarda o devuelve body inválido.
- **Then:** mantiene reserva y UNKNOWN, reintenta con backoff y expone estado al usuario.

#### RAIL-07 — Worker reiniciado

- **Given:** mock aceptó pero payments no guardó resultado.
- **When:** payments reinicia y expira lease.
- **Then:** consulta referencia antes de reenviar; finaliza una vez con ledger/eventos únicos.

#### RAIL-08 — Respuesta inesperada

- **Given:** banco devuelve 500 o JSON incompatible.
- **When:** worker procesa respuesta.
- **Then:** la trata como ambigua, conserva fondos y concilia; no interpreta 500 como rechazo.

#### MOCK-01 — Contrato e idempotencia bancaria

- **Given:** referencia persistida con payload normalizado.
- **When:** se repite o cambia su payload.
- **Then:** mismo contenido devuelve resultado guardado; contenido distinto devuelve 409; un único efecto.

#### MOCK-02 — Persistencia bancaria

- **Given:** transferencia aceptada y reverso conocido.
- **When:** se reinicia el contenedor del mock conservando volumen.
- **Then:** GET devuelve transferencia y reverso previos.

#### MOCK-03 — Modos de fallo

- **Given:** mock en modo random o pruebas.
- **When:** se envían operaciones.
- **Then:** random puede producir los cuatro tipos de respuesta; tests fuerzan cinco escenarios sin depender de azar.

### Reversos

#### REV-01 — Interno exitoso

- **Given:** transferencia interna COMPLETED y destinatario con disponible suficiente.
- **When:** origen solicita reverso total.
- **Then:** 201 con reverso COMPLETED y transferencia REVERSED, movimientos compensatorios exactos.

#### REV-02 — Sin saldo para devolver

- **Given:** destinatario gastó fondos o los tiene reservados.
- **When:** origen solicita reverso interno.
- **Then:** 409 INSUFFICIENT_FUNDS; transferencia sigue COMPLETED y no hay compensación parcial.

#### REV-03 — Estado incompatible

- **Given:** transferencia PENDING, PROCESSING, UNKNOWN, FAILED o REVERSED.
- **When:** se solicita reverso.
- **Then:** 409 INVALID_TRANSFER_STATE o ALREADY_REVERSED; no mueve dinero.

#### REV-04 — Carrera de reversos

- **Given:** transferencia COMPLETED.
- **When:** dos solicitudes con keys diferentes intentan reversar a la vez.
- **Then:** solo un reverso activo/exitoso; la otra devuelve 409 REVERSAL_IN_PROGRESS o ALREADY_REVERSED.

#### REV-05 — Reverso externo aceptado

- **Given:** externa COMPLETED.
- **When:** el mock acepta reverso.
- **Then:** se acredita una vez el origen y transferencia pasa a REVERSED solo tras confirmación.

#### REV-06 — Reverso externo rechazado

- **Given:** externa COMPLETED con reverso pendiente.
- **When:** mock rechaza reverso.
- **Then:** reverso FAILED; transferencia conserva COMPLETED y saldo del origen sin crédito; nuevo intento exige nueva key.

#### REV-07 — Reverso externo indisponible

- **Given:** un reverso pendiente.
- **When:** mock devuelve 503.
- **Then:** conserva reverso PENDING y transferencia COMPLETED; reintenta sin acreditar.

#### REV-08 — Reverso externo ambiguo

- **Given:** reverso con timeout procesado o no procesado.
- **When:** se consulta GET de la transferencia original.
- **Then:** si reversal.reference coincide aplica el resultado; si está ausente reenvía misma referencia; jamás acredita dos veces.

#### REV-09 — Permiso y monto del reverso

- **Given:** una transferencia completada.
- **When:** destinatario intenta reversar o se envía un monto parcial.
- **Then:** solo origen está autorizado; API pública no acepta monto ni reversos parciales.

### Auditoría y mensajería

#### AUD-01 — Eventos completos

- **Given:** una transferencia creada y resuelta.
- **When:** audit consume sus eventos.
- **Then:** persiste created y cada cambio de estado con actor, IDs, secuencia, timestamps y correlación.

#### AUD-02 — Broker caído

- **Given:** RabbitMQ detenido.
- **When:** se completa una transferencia interna.
- **Then:** dinero y outbox se comprometen; al recuperar broker audit recibe todos los eventos.

#### AUD-03 — Publicación ambigua

- **Given:** broker aceptó pero publisher cae antes de marcar published.
- **When:** se recupera publicador.
- **Then:** republica mismo eventId y audit conserva una sola fila.

#### AUD-04 — Consumidor reiniciado

- **Given:** audit guardó evento pero no envió ack.
- **When:** se reinicia audit.
- **Then:** redelivery produce no-op y ack; no duplica historial.

#### AUD-05 — Fuera de orden

- **Given:** eventos con secuencias distintas llegan desordenados.
- **When:** se consulta auditoría.
- **Then:** ordena por secuencia y conserva todos; no sobreescribe estados anteriores.

#### AUD-06 — Mensaje inválido

- **Given:** payload inválido o conflicto de eventId con otro contenido.
- **When:** consumidor recibe mensaje.
- **Then:** no lo descarta silenciosamente: envía a DLQ, registra error y sigue atendiendo mensajes válidos.

#### AUD-07 — Autorización de consulta

- **Given:** JWT válido y transferencia ajena o payments caído.
- **When:** se consulta auditoría.
- **Then:** 404 para recurso ajeno; 503 si no puede comprobar permiso; no filtra eventos.

#### AUD-08 — Aislamiento SQL

- **Given:** credenciales runtime de cada servicio.
- **When:** se intenta leer otro esquema.
- **Then:** PostgreSQL deniega acceso aunque se use nombre de esquema explícito.

### Frontend, operación y entrega

#### UI-01 — Doble clic y reintento

- **Given:** formulario válido.
- **When:** se hace doble clic o hay fallo de red al enviar.
- **Then:** un envío activo y una key por intención; repetir conserva key y recupera operación.

#### UI-02 — Seguimiento

- **Given:** una transferencia o reverso no terminal.
- **When:** se abre detalle.
- **Then:** polling cada 2 s, estados explícitos y opción de reintentar lectura; no muestra éxito antes de confirmación.

#### UI-03 — Auditoría eventual

- **Given:** transferencia visible y auditoría todavía vacía.
- **When:** se consulta detalle.
- **Then:** muestra estado vacío/sincronizando sin afirmar pérdida; actualiza al llegar eventos.

#### UI-04 — Tema y accesibilidad

- **Given:** preferencia claro/oscuro/sistema.
- **When:** se cambia tema o navega con teclado y viewport móvil.
- **Then:** persiste preferencia, evita flash de tema, foco visible y errores/estados legibles sin depender solo de color.

#### UI-05 — Sesión expirada

- **Given:** access token expirado y refresh válido o inválido.
- **When:** UI consulta una API.
- **Then:** renueva una sola vez mediante single-flight; si falla vuelve a login sin bucles ni reenvío con otra key.

#### OPS-01 — Arranque limpio

- **Given:** clon con .env configurado y Docker disponible.
- **When:** se ejecuta docker compose up --build -d.
- **Then:** levanta todos los servicios, aplica migrations/seeds y healthchecks; segundo arranque conserva dinero y datos.

#### OPS-02 — Secretos y redes

- **Given:** servicios desplegados.
- **When:** se inspecciona configuración y browser.
- **Then:** solo frontend expuesto públicamente; ninguna credencial DB, AMQP o key privada llega al cliente.

#### SDD-01 — Contrato primero

- **Given:** cambio de comportamiento propuesto.
- **When:** se implementa.
- **Then:** spec/contrato cambian antes del código, test referencia criterio y commits pequeños permiten rastrearlo.

## Aceptación de la entrega

Todos los criterios financieros, de autorización, aislamiento y recuperación son core. Si el tiempo limita la UI o despliegue VPS, registrar lo pendiente explícitamente; no marcar criterios como cubiertos por existir un documento. El Compose funcional y los tres servicios siguen siendo requisitos de entrega.

### Documentación interactiva backend

#### API-01 — Swagger por servicio

- **Given:** auth, payments o audit en ejecución.
- **When:** se consulta /docs o /docs-json del servicio en red privada.
- **Then:** Swagger UI y documento JSON describen solo sus operaciones, schemas y bearer auth, derivados del OpenAPI aprobado; no se exponen secretos ni rutas de otros servicios.
