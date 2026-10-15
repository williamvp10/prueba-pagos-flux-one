# Reglas de implementación

## Fuentes y flujo SDD
- Leer `docs/spec.md`, `docs/architecture.md`, `docs/openapi.yaml` y `docs/rail.openapi.yaml` antes de implementar.
- Cambiar primero spec y contratos; después código y tests. Cada test de aceptación lleva el ID del criterio que demuestra.
- La aclaración del evaluador autoriza construir el mock y definir sus responses; conservar exactamente los tres endpoints requeridos.
- Trabajar en un solo monorepo, sobre `main`, con commits pequeños y verificables. No falsear fechas, resultados o trabajo manual.
- Mantener `docs/traceability.md` y `docs/ai-log.md`. Un criterio documentado no equivale a un criterio implementado.

## Límites hexagonales
- Tres servicios de negocio separados: auth, payments, audit; un proceso adicional para el mock y Next.js para web.
- Domain y application no importan NestJS, TypeORM, AMQP, HTTP ni código de otros servicios.
- Domain contiene invariantes; application coordina puertos; infrastructure implementa adaptadores; composition root conecta dependencias.
- TypeORM entities NO son entidades de dominio. El puerto UnitOfWork mantiene juntos movimientos, saldos, estados y outbox.
- No compartir repositories, entidades ORM ni tablas entre servicios. Compartir contratos generados y utilidades sin negocio.
- Cada conexión PostgreSQL utiliza un rol limitado a su esquema. No joins ni claves foráneas entre esquemas.

## Dinero, idempotencia y fallos
- COP con máximo dos decimales. API usa strings decimales canónicos; dominio usa bigint en centavos. Nunca floats para dinero.
- No saldo negativo; toda salida exige saldo disponible. Los movimientos son inmutables y los reversos crean movimientos compensatorios.
- Idempotency-Key obligatorio para transferir/reversar: unicidad persistente por subject + operación + key, hash del payload semántico y resultado original.
- Concurrencia se resuelve en PostgreSQL, no con locks en memoria. Bloquear cuentas en orden estable.
- Cambios de dinero/estado y outbox son atómicos. No hacer HTTP/AMQP dentro de esa transacción.
- Timeout no significa rechazo: conservar reserva y conciliar. Solo liberar cuando hay rechazo definitivo; reenvíos usan la misma referencia bancaria.
- Nunca acreditar un reverso externo antes de confirmación. Un máximo de un reverso activo/exitoso por transferencia.
- Consumidor de auditoría idempotente; ack después de persistir. No prometer exactly-once en la red.
- No registrar contraseñas, tokens, claves privadas ni payloads sensibles.

## Entrega
- Fuente de configuración: un `.env` raíz no versionado; `.env.example` sin secretos reales. Inyectar únicamente variables necesarias por servicio.
- Migrations explícitas, `synchronize: false`, seeds idempotentes y nunca resetear datos al arrancar.
- Usar shadcn para componentes disponibles, tokens semánticos y claro/oscuro/sistema. El frontend no decide reglas financieras.
- No enviar correos ni invitaciones sin autorización humana explícita. Publicación del código no incluye secretos.
- Estado actual: fase documental; no afirmar que existen aplicaciones, Compose funcional ni tests ejecutables hasta implementarlos.
