# Plan de implementación y flujo SDD

## Estado y prioridad

Estado de entrega base: backend, portal/BFF y riel simulado integrados en `main`; `pnpm test:all`, smoke de Compose y disponibilidad pública en Dokploy están documentados. El despliegue en `central-banking-system.dokploywill.dpdns.org` se verificó desde el commit `6a71e46`. La siguiente iteración añade links de cobro privados con QR: specs y contratos primero, backend a cargo del coordinador y frontend/BFF a cargo de otro agente en rutas exclusivas.

Horario objetivo comunicado: 15-10-2026, 08:30–11:30 America/Bogota, con spec inicial antes de 09:00. El commit inicial real fue `890d03d`, a las 09:02:38 -05:00: el hito de las 09:00 no se cumplió. Conservar esa evidencia sin reescribir fechas.

## Secuencia de trabajo

| Paso | Resultado revisable | Gate |
|---|---|---|
| 1. Spec inicial | AGENTS, spec, OpenAPI, arquitectura | Commit `spec: initial`, consistencia y validación de contratos |
| 2. Bootstrap | pnpm monorepo, apps separadas, contratos generados, DB/migrations | Compila; roles/esquemas aislados; CI básico |
| 3. Core interno | dinero, ledger, cuentas, locks, idempotencia, reverso | PAY/IDEM/REV internos con PostgreSQL real |
| 4. Mock y externas | tres endpoints, worker, leases, reservas y conciliación | cinco escenarios deterministas y recuperación tras reinicio |
| 5. Auth y auditoría | login/registro/sesiones, autorización, outbox/consumer | permisos, rotación, caída de broker y deduplicación |
| 6. Frontend | cuentas, crear, detalle, historial/auditoría, temas | flujo browser con doble clic y errores |
| 7. Integración | Compose limpio, README real, matriz actualizada | completado; pruebas y smoke integrado registrados |
| 8. Entrega | despliegue, repositorio y lista de pendientes | despliegue verificado; README actualizado; publicación de cambios finales y correo de entrega quedan por completar |
| 9. Spec links QR | LINK-01..08, UI-06..09, OpenAPI, arquitectura y modelo | contratos lint, tipos regenerados y handoff frontend sin decisiones abiertas |
| 10. Backend links QR | dominio/application/adapters/migration/config de payments | unit + PostgreSQL real + contrato; una transferencia por link bajo concurrencia |
| 11. Frontend links QR | Cobros, QR, `/pay`, BFF y estados accesibles | typecheck/build/unit/browser; token ausente de storage/logs/URL HTTP |
| 12. Integración QR | Compose, flujo A crea/B paga/tercero denegado, docs y evidencia | `pnpm test:all`, browser journey, smoke limpio y matriz actualizada |

Los pasos pueden dividirse en commits más pequeños. Auth debe estar integrado antes de considerar pagos expuesto a usuarios; no entregar un modo inseguro de actor por header para ahorrar tiempo.

## Trunk-based development

- Un repositorio, `main` como trunk; commits pequeños con spec/feat/fix/test/docs/chore.
- Primero spec/contrato del cambio; luego implementación y test relacionado. No un único commit final ni ramas longevas.
- Commit messages sugeridos: `feat(payments): exact money and internal transfers`, `test(payments): concurrent idempotency`, `feat(rail): deterministic failure scenarios`, `feat(audit): durable outbox consumption`.
- CI sobre push a main: contrato, lint/types, unit, integración financiera y aceptación core. Si hay gate rojo, corregir antes de sumar alcance.
- Publicar GitHub como repo público con el nombre indicado tras comprobar que no hay secretos. No invitar colaboradores ni enviar correo sin autorización explícita; dejar lista operativa al usuario.

## Definition of done por criterio

Spec identificable + contrato actualizado si aplica + comportamiento implementado + test con ID y resultado real + matriz actualizada. Gate global: aislamiento, sin doble débito, sin sobregiro, recuperación de UNKNOWN, outbox durable, arranque Compose y README comprobado.

## Entrega y sesión posterior

README final debe decir qué corre, cómo probar en menos de cinco comandos, decisiones, supuestos y pendientes reales. El README de entrega ya incluye el arranque local, el demo en vivo, stack, pruebas, documentación y límites. Registrar uso de IA y al menos un error real corregido, sin inventar trabajo manual. Preparar explicación de un recorrido end-to-end: key → lock/reserva → banco → resultado → outbox → audit → UI.

## Iteración de links QR con agente frontend

Seguir docs/collaboration.md. El prompt `docs/prompts/payment-links-frontend-agent.md` reserva `apps/web/**` y `docs/handoffs/frontend.md` para el agente frontend. El coordinador conserva contratos, tipos generados, lockfile, configuración, documentación central y todo `apps/payments/**`. El frontend puede declarar `qrcode`/tipos en su manifest y solicitar instalación, pero no modifica lockfile ni contratos. Backend debe exponer primero el contrato acordado o el agente usa fixtures exclusivamente en tests; nunca inventa un mock productivo.
