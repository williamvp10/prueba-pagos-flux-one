# Verificación de la base documental

Fecha: 2026-10-15, America/Bogota. Estado evaluado: documentación previa a implementación.

| Verificación real | Resultado |
|---|---|
| Redocly CLI 2.64.0, OpenAPI de servicios/browser/mock | Válidos, cero errores; 4 warnings de estilo: licencia sin URL y server localhost de desarrollo |
| Mermaid CLI 12.0.0, render con Chrome | 6 diagramas convertidos a SVG sin errores de sintaxis |
| AJV 8 con ajv-formats, JSON Schema 2020-12 | Schema compila, ejemplo válido, monto numérico rechazado |
| Correspondencia spec → matriz | 61 IDs únicos y una fila por criterio |
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

No existen todavía apps, tests de negocio, CI ni Compose. Ningún criterio de aplicación está marcado como verificado por validar su spec. No hay remote, push, invitaciones, correo de entrega ni despliegue VPS. Esas comprobaciones pertenecen a la siguiente fase.

El commit inicial 890d03d se creó a las 09:02:38 -05:00, después del hito de 09:00. Se conserva historial auténtico. Los contratos se corrigieron después mediante otro commit, sin amend ni cambio de fechas.

## Graphify y colaboración

- Skill oficial instalada en .codex/skills/graphify, scope de proyecto; no settings globales modificados. Wrapper ./tools/graphify usa graphifyy 0.9.62 y PyYAML 6.0.3 para rebuild.
- Rebuild real genera graph.json, graph.html, GRAPH_REPORT.md y context-manifest.json. Consultas query/explain devuelven ubicaciones de specs; path de navegación documental se prueba con --undirected.
- Índice inicial con más de 280 nodos; tamaño exacto puede crecer con nueva documentación. Imports externos/no resueltos se omiten con conteo explícito; ninguna dependencia de aplicación se considera implementada por aparecer en docs.
- .graphifyignore excluye skills vendor, secretos, outputs y dependencias. graphify-out está ignorado por Git. Solo coordinador reconstruye; ningún auxiliar iniciado desde esta sesión.
- AGENTS, estrategia de coordinación y prompt del mock presentes; ownership por rutas y un único responsable de commits/lockfile.
