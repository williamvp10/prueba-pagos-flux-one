# Eventos, outbox y auditoría

## Contrato

Fuente verificable: `contracts/audit-event.v1.schema.json` (JSON Schema 2020-12). Exchange `fluxone.audit.v1`, tipo topic, durable. Routing key `transfer.<eventType>`; consumer queue `fluxone.audit.v1.persist`, durable, vinculada con `transfer.#`. Payments y audit declaran la misma topología idempotente antes de publicar/consumir; el arranque de audit no es requisito para conservar mensajes. En v1 un broker con almacenamiento persistente; no implica alta disponibilidad.

Envelope obligatorio: `eventId`, `version: 1`, `type`, `transferId`, `sequence`, `actorId`, `occurredAt`, `correlationId`, `data`. UUIDs salvo correlación; fechas UTC RFC3339. `actorId` conserva el iniciador, aunque el cambio lo ejecute un worker. Correlación inicial se persiste con la operación.

`data` contiene `transferStatus`, `amount`, `currency`, `sourceAccountId`, `destinationKind`, `destinationCode` y campos nullable de reverso. No passwords, tokens, emails ni detalles del error del proveedor. Un evento es un hecho inmutable, no un comando.

| Tipo | Hecho |
|---|---|
| transfer.created | Transferencia aceptada localmente |
| transfer.processing | Inició un intento bancario |
| transfer.pending | 503 dejó la operación pendiente de nuevo intento |
| transfer.unknown | Resultado bancario incierto |
| transfer.completed | Movimiento confirmado |
| transfer.failed | Banco rechazó definitivamente |
| reversal.requested | Solicitud de reverso aceptada |
| reversal.processing | Inició intento bancario de reverso |
| reversal.pending | Reverso pendiente tras indisponibilidad |
| reversal.unknown | Resultado incierto del reverso |
| reversal.completed | Compensación confirmada |
| reversal.failed | Rechazo definitivo del reverso |
| transfer.reversed | Transferencia quedó compensada |

No emitir eventos de estado si no hubo transición. Un reverso interno produce requested/completed y transfer.reversed en la misma TX. Transferencia interna produce created/completed en una TX. El evento created representa estado inicial PENDING lógico aunque la fila ya esté COMPLETED al terminar esa TX. Las secuencias se asignan bajo lock de transferencia y son únicas; audit ordena por secuencia, no por hora de llegada.

## Entrega confiable

1. La TX de negocio escribe todos sus eventos outbox antes del commit; error en outbox revierte el dinero.
2. Publicador reclama filas con lease y publica con `messageId = eventId`, `persistent = true`, `contentType = application/json`, routing key y flag `mandatory`.
3. Marcar published solo tras publisher confirm positivo y sin basic.return. Si exchange/queue no existe, no dar por entregado.
4. Sin confirmación, canal cerrado o basic.return: no marcar; reintentar con backoff 1/2/4/8/16/30 s y jitter. Sin límite que descarte eventos. Avisar tras 20 intentos.
5. Caída entre confirm y update puede duplicar: se reenvía mismo eventId y payload. Garantía al menos una vez.
6. Audit valida JSON Schema y hace INSERT con eventId único en una TX. Commit y después ack. Duplicado idéntico es no-op.

## Reintentos y mensajes problemáticos

- Error temporal DB: pausar consumo/reabrir conexión con backoff, sin ack ni descarte. El mensaje continúa en la cola o unacked; evitar bucle de nack/requeue inmediato.
- Mensaje inválido/conflicto de identidad: publicar copia persistente con motivo en exchange/queue DLQ `fluxone.audit.v1.dead` y confirmar esa publicación ANTES de ack del original. Si la DLQ no confirma, no ack. DLQ durable y sin TTL.
- Duplicados en DLQ son posibles y aceptables; no equivalen a duplicados contables. Recuperación: herramienta operativa autenticada por red privada que valide y republica mismo eventId; nunca editar el hecho original silenciosamente.
- No afirmar auditoría actualizada antes de consumir; frontend puede mostrar historial temporalmente vacío. La caída de broker/audit no bloquea pagos.
- Monitorizar outbox pendiente/edad, errores/confirmaciones, mensajes DLQ, lag consumidor y operaciones UNKNOWN. Logs estructurados con IDs; salud degradada no dispara borrado de datos.

## Consultas y alcance

Audit solo lee audit_schema; autoriza cada lectura mediante payments. Transferencias se pueden consultar antes de que llegue su evento. Auditoría financiera cubre acciones de recursos existentes; entradas inválidas o credenciales fallidas quedan en logs de seguridad, sin crear transferencias ficticias.
