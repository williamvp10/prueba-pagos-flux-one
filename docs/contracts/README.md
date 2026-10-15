# Contratos y política API First

| Fuente | Productor / consumidor | Generación objetivo |
|---|---|---|
| ../openapi.yaml | Auth/Payments/Audit → BFF | Cliente TypeScript solo servidor |
| ../browser.openapi.yaml | BFF → componentes web | Tipos/fetch del mismo origen |
| ../rail.openapi.yaml | Mock → adapter de payments | Tipos del adapter y validación provider |
| audit-event.v1.schema.json | Payments → Audit | Validación runtime y tipos versionados |

Los archivos HTTP describen APIs objetivo, no implementadas todavía. El contrato de browser es derivado del privado con adaptación de sesión: mismos payloads financieros, cookies en lugar de bearer y sin Tokens en responses. Cambiar ambos contratos antes de cambiar comportamiento. En bootstrap se automatizará la generación/verificación para evitar duplicación manual.

## Semántica común

- Base /api/v1 para servicios y BFF; mock conserva /rail. Cada servicio implementa solo su tag; los servers por operación indican host correcto.
- application/json; objetos cerrados rechazan propiedades desconocidas. JSON malformado → 400; validación de estructura/campos → 422. Respetar los headers de idempotencia declarados.
- Error contiene code estable, message humano y requestId. details es opcional para campos. No exponer stacktrace, SQL ni cuerpos crudos del banco.
- 401 para identidad inválida, 404 para recurso inexistente o fuera de permisos, 409 para conflicto de negocio, 429 con Retry-After para rate limit, 503 para dependencia temporalmente indisponible. BFF agrega 403 ORIGIN_NOT_ALLOWED.
- Códigos de negocio: INSUFFICIENT_FUNDS, SAME_ACCOUNT, BALANCE_LIMIT_EXCEEDED, INVALID_TRANSFER_STATE, REVERSAL_IN_PROGRESS, ALREADY_REVERSED, IDEMPOTENCY_CONFLICT, IDEMPOTENCY_KEY_REQUIRED, IDEMPOTENCY_KEY_INVALID, RESOURCE_NOT_FOUND, VALIDATION_ERROR y EMAIL_TAKEN. Banco agrega BANK_REJECTED/BANK_REVERSAL_REJECTED como failureCode; UNKNOWN no es fallo terminal.
- RequestId generado o propagado desde un valor seguro <=128 caracteres; devolver en error y X-Request-Id en toda respuesta. No usarlo como sustituto de Idempotency-Key.
- Financieros POST: 201 para interna confirmada, 202 para externa persistida. El cuerpo es snapshot original. GET revela estado actual. Idempotency-Replayed: true indica replay; primera respuesta puede omitir header o ser false.
- Historial: limit 20 por defecto, máximo 100; cursor opaco inválido → 422. Transferencias: createdAt DESC e id DESC; auditoría: sequence ASC. Cursor incluye filtros para impedir reutilización incompatible.
- Dates UTC ISO8601. UUID canónico en respuestas; normalizar IDs/amount/currency antes de hash semántico. COP exclusivamente. No timestamps del cliente.
- Reverso público sin body ni amount: el servidor deriva importe total. No soporta PATCH/DELETE/cancel ni reverso parcial.
- Links de cobro: `POST /payment-links`, `/payment-links/pay` y `/{id}/cancel` exigen keys independientes. Resolver token y emitir share-token son lecturas autenticadas sin idempotency key. Solo pagos internos, un uso y 24 h de vigencia.
- El token `pl1` es una invitación por posesión y no forma parte de snapshots idempotentes, storage browser, logs ni eventos. El browser lo transporta desde un fragmento URL hacia bodies POST; responses de token/resolución usan `private, no-store`.
- Códigos adicionales: PAYMENT_LINK_EXPIRED, PAYMENT_LINK_NOT_ACTIVE y PAYMENT_LINK_ALREADY_PAID. Token inválido, recurso ajeno o resolución de link no activo usa RESOURCE_NOT_FOUND para no crear un oráculo.

## Versionado y checks

Cambios aditivos compatibles mantienen /v1 y event version 1. Cambios incompatibles requieren contrato y versión nuevos, migración explícita de consumidores y actualización de escenarios. No regenerar specs desde decorators del backend como fuente autoritativa: validar implementación contra contratos previamente aprobados.

Comprobar que no cambien payloads financieros entre servicio y BFF, que el browser no reciba tokens y que el mock mantenga exactamente las tres rutas acordadas. Ejemplo JSON de evento es una fixture contractual, no evidencia de ejecución de pagos.
