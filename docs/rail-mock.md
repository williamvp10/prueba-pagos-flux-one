# Especificación del riel simulado

La aclaración del evaluador permite crear el servicio y definir sus response bodies. Fuente HTTP: `rail.openapi.yaml`. Implementar exactamente los tres endpoints de la tabla, sin GET adicional para reversos.

## Entrada y persistencia

- UUID `reference` generado por payments y estable para todos los reintentos. Referencias globalmente únicas entre transferencias y reversos; cambiar de tipo/payload bajo una referencia existente devuelve 409.
- Montos string COP positivos, hasta dos decimales, normalizados antes de hash. Formato inválido → 400 sin persistir operación; reglas bancarias válidas pero rechazadas → 422 con resultado REJECTED persistido.
- `from`: código de cuenta interna precargada o cuenta provisionada por payments (prefijo ACC-); el mock no consulta DB de payments ni valida su saldo. Confía en la validación del origen hecha por payments; es una concesión del simulador.
- `to`: EXT-001 o EXT-002 precargados; desconocido → 422 REJECTED. Payments valida el mismo catálogo antes de reservar.
- SQLite con transacciones, unique reference, payload hash, tipo, resultado, processedAt y originalReference. Migración y volumen propios; sin compartir DB.
- Cada ACCEPTED representa un efecto bancario lógico único. No construir un segundo sistema de balances bancarios: el simulador registra operaciones y compensaciones.
- Comprobar idempotencia antes de elegir azar. Claims/índices SQLite serializan solicitudes concurrentes; el primer resultado comprometido gana y todos los replay devuelven el mismo resultado.

## Matriz de comportamiento para referencias nuevas

| Escenario | HTTP | Efecto durable | Consulta posterior |
|---|---|---|---|
| accepted | 200 ACCEPTED | Operación aceptada | 200 ACCEPTED |
| rejected | 422 REJECTED | Rechazo registrado, sin efecto monetario | 200 con status REJECTED |
| unavailable | 503 | Ninguna operación procesada | 404 si aún no existe |
| timeout_processed | Respuesta a los 12 s | ACCEPTED comprometido antes de demorar respuesta | 200 ACCEPTED |
| timeout_not_processed | Respuesta a los 12 s | Ninguna operación procesada | 404 si aún no existe |

Payments tiene timeout de 10 s; el mock no depende de que el cliente siga conectado para conservar un resultado ya procesado. Al terminar los 12 s del escenario no procesado, responder 503 si la conexión sigue abierta; no ejecutar procesamiento tardío oculto.

Modo random: cada escenario anterior con peso 20%; son cuatro categorías HTTP del enunciado con dos variantes de timeout. GET no elige azar: siempre refleja almacenamiento; su caída se inyecta en pruebas de adaptador/red.

Modo test: secuencia de escenarios configurable al arrancar (`RAIL_SCENARIOS=...`); el replay de una referencia ya persistida no consume la secuencia. Al agotarse, usar accepted. Ningún header enviado por browser ni endpoint público permite forzar resultados.

## Reversos

- Solo total sobre original ACCEPTED. Original inexistente, REJECTED, monto distinto o ya reversado → 422 REJECTED con reason estable.
- Validación, deduplicación y marca de reversado del original en una sola TX SQLite. Un único reverso ACCEPTED por original, incluso con referencias concurrentes.
- GET de la transferencia incluye `reversal: null` o el último resultado de intento, con reference, originalReference, amount, status, reason y processedAt. Mantiene además el status original ACCEPTED/REJECTED; no confundir aceptación original con compensación.
- Payments compara la referencia del intento activo. Un reverso fallido previo no confirma ni rechaza un intento nuevo. Nuevo intento solo permitido después de resultado FAILED definitivo.
- Si el reverso no aparece, reintentar el POST con su misma reference: deduplicación bancaria evita doble compensación, incluso si el request original aún estaba en vuelo.

## Límites de uso

Solo red privada. El mock no tiene autenticación pública ni integra banco real. Persistencia en volumen permite probar reinicios, no garantiza supervivencia a pérdida del disco. Tests verifican contrato, concurrencia y escenarios sin depender de probabilidades.
