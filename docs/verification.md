# Verificación documental e implementación

Fecha: 2026-10-15, America/Bogota. Este documento conserva verificaciones por fase; el bloque final describe el backend actual.

| Verificación real | Resultado |
|---|---|
| Redocly CLI 2.64.0, OpenAPI de servicios/browser/mock | Válidos, cero errores; 4 warnings de estilo: licencia sin URL y server localhost de desarrollo |
| Mermaid CLI 12.0.0, render con Chrome | 6 diagramas convertidos a SVG sin errores de sintaxis |
| AJV 8 con ajv-formats, JSON Schema 2020-12 | Schema compila, ejemplo válido, monto numérico rechazado |
| Correspondencia spec → matriz | 62 IDs únicos y una fila por criterio |
| Enlaces Markdown locales | Targets existentes |
| Payloads financieros servicio/browser | Schemas iguales |
| Rutas del mock | Exactamente los 3 endpoints de la tabla |
| Sesión browser | Login referencia BrowserSession; no existe schema Tokens en contrato browser |
| git diff --check | Sin errores de whitespace |

Los warnings no se ocultan: no se eligió licencia de distribución y no hay dominio final. UNLICENSED expresa ausencia de permiso de uso, no una licencia open source. Ajustar licencia cuando el propietario decida; reemplazar localhost al publicar la URL del entorno.

## Cómo repetir validación de contratos

Desde la raíz del repositorio, con Node/npm disponibles:

```sh
npx --yes @redocly/cli@2.64.0 lint docs/openapi.yaml docs/browser.openapi.yaml docs/rail.openapi.yaml
npm exec --yes --package=ajv-cli@5.0.0 --package=ajv-formats@3.0.1 -- ajv validate --spec=draft2020 -c ajv-formats -s docs/contracts/audit-event.v1.schema.json -d docs/contracts/audit-event.v1.example.json
```

Para Mermaid, usar @mermaid-js/mermaid-cli@12.0.0 con Chrome/Chromium disponible y su configuración de Puppeteer. Renderizar architecture.md, data-model.md y deployment.md hacia un directorio temporal. Esta sesión usó Chrome de macOS y generó los seis SVG en /tmp/fluxone-diagrams; esos intermediarios no son entregables ni parte del repo.

## Límites de evidencia

En esta verificación documental inicial todavía no existían apps, tests, CI ni Compose. La fase backend posterior se detalla abajo. Hoy `origin` está configurado y `main` conserva commits locales pendientes de push; publicación, invitaciones, correo y despliegue VPS siguen pendientes.

El commit inicial 890d03d se creó a las 09:02:38 -05:00, después del hito de 09:00. Se conserva historial auténtico. Los contratos se corrigieron después mediante otro commit, sin amend ni cambio de fechas.

## Graphify y colaboración

- Skill oficial instalada en .codex/skills/graphify, scope de proyecto; no settings globales modificados. Wrapper ./tools/graphify usa graphifyy 0.9.62 y PyYAML 6.0.3 para rebuild.
- Rebuild real genera graph.json, graph.html, GRAPH_REPORT.md y context-manifest.json. Consultas query/explain devuelven ubicaciones de specs; path de navegación documental se prueba con --undirected.
- Índice inicial con más de 280 nodos; tamaño exacto puede crecer con nueva documentación. Imports externos/no resueltos se omiten con conteo explícito; ninguna dependencia de aplicación se considera implementada por aparecer en docs.
- .graphifyignore excluye skills vendor, secretos, outputs y dependencias. graphify-out está ignorado por Git. Solo coordinador reconstruye; ningún auxiliar iniciado desde esta sesión.
- AGENTS, estrategia de coordinación y prompt del mock presentes; ownership por rutas y un único responsable de commits/lockfile.

## Backend implementado y verificado

- `pnpm contracts`: tipos de servicios y browser generados y exportados en @fluxone/api-client.
- `pnpm test`: build de kit y tres servicios, 3 unitarias y 13 tests de integración/configuración aprobados. Respuestas HTTP de la suite verificadas contra el contrato fuente.
- `node --test --test-name-pattern=IDEM-05 tests/backend.test.cjs`: rollback tras escribir débito/crédito y fallar outbox de completed, aprobado.
- PostgreSQL/RabbitMQ reales en Docker; DB y vhost de test exclusivos se crean y eliminan. Simulador HTTP bancario exclusivamente de test; no sustituye el servicio delegado.
- `docker compose config --quiet`: configuración válida. `docker compose build auth`: imagen backend construida con los tres servicios. Arranque dirigido a auth/payments/audit ejecuta init, migraciones y seed. Swagger y salud dev 3101/3102/3103 responden 200.
- CI completo configurado en .github/workflows/backend.yml para `pnpm test:all`; no se ha ejecutado en GitHub.
- Pruebas pendientes: ventanas reales de crash entre confirm/update y persist/ack, escenarios específicos de reversos externos, UI y mock final de auxiliares, Compose completo y Dokploy. Matriz diferencia evidencia parcial.

Correcciones verificadas: normalización del resultado UPDATE RETURNING de TypeORM, enum nullable de reversalStatus, cursor sin pérdida de microsegundos y credenciales propias de audit en Compose. Puerto ajeno 3001 conservado intacto; backend dev usa 3101–3103.

## Integración de rail y frontend

- Las ramas auxiliares quedaron limpias después de los commits de entrega. `main` contiene `e6462b9` (rail) y `8d0931b` (frontend); el coordinador agregó el cableado de Compose y el build standalone del portal en commits posteriores.
- `pnpm test:all` pasó: backend 3 unitarias + 13 integración/configuración; rail 8/8 más análisis de fuentes con Node 24.11.0; frontend typecheck, 3/3 unitarias y build Next.js 16.4.1.
- `docker compose ... config --quiet` aprobó y las imágenes `web` y `rail-mock` construyeron. El proyecto aislado `fluxone-int` arrancó todos los servicios y healthchecks. Se parametrizaron puertos del override de desarrollo para evitar colisiones con los servicios existentes.
- Smoke integrado por HTTP contra el BFF: login `200` devuelve solo usuario/expiración y cookies HttpOnly; cuentas `200`; transferencia externa `202 → COMPLETED` a través del riel; reverso externo `202 → REVERSED`; auditoría `200` con cuatro eventos; logout `204`. Se usó un PostgreSQL, RabbitMQ y SQLite aislados con escenario aceptado, sin tocar saldos demo del proyecto principal.
- El healthcheck web detectó y permitió corregir la ruta del servidor standalone bajo `apps/web/server.js`. La primera versión del Dockerfile del mock no correspondía al contexto raíz; Compose también expuso colisión de puertos durante el smoke, resuelta con overrides configurables.

Límites: no se hizo una prueba automatizada en navegador ni revisión visual completa de tema claro/oscuro; UI-01..05 siguen pendientes de evidencia browser. El mock valida sintaxis/runtime de type stripping, no tipos TypeScript semánticos. CI remoto, VPS/Dokploy y push siguen pendientes.
