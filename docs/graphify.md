# Graphify para recuperar contexto

## Integración reproducible

Se usa el proyecto oficial https://github.com/Graphify-Labs/graphify. Paquete PyPI **graphifyy** (doble y), CLI graphify. La integración del repo fija 0.9.62 a través de uvx, aislada del graphify 0.8.20 instalado globalmente. No modifica settings globales ni credenciales.

La skill oficial está versionada en `.codex/skills/graphify/` mediante instalación project-scoped. Se omitió su hook de compatibilidad no-op porque usa el comando global; las reglas de este AGENTS y el wrapper dan comportamiento explícito, fijado y sin reconstrucciones concurrentes.

Requisito: uv/uvx y Python compatible disponible. Primer uso descarga Graphify/dependencias desde el registro; se reutiliza caché. No agregar Graphify a los contenedores ni al runtime de la app.

```sh
./tools/graphify rebuild
./tools/graphify query "idempotencia" --budget 1200
./tools/graphify query "rail reversos" --budget 1200
./tools/graphify explain "Algoritmo idempotente"
./tools/graphify path "Algoritmo idempotente" "Dinero" --undirected
```

## Qué representa el grafo

- AST de código con extractor nativo Graphify. Se omiten referencias externas/no resueltas que no tienen nodo local; se informa el conteo en consola/manifiesto, sin inventar dependencias.
- Índice determinista local de encabezados Markdown, operaciones OpenAPI y links existentes entre documentos. Cada nodo/relación conserva ubicación de origen y relaciones documentales explícitas se marcan EXTRACTED.
- Construcción, clustering, export y query ejecutados por librerías/CLI oficiales Graphify.
- No se ejecuta una pasada semántica LLM ni se promete que el índice documental resuelva relaciones implícitas. No se usan API keys, Graphify Cloud ni servicios externos para analizar contenido.
- Todavía no hay código de aplicaciones: el grafo inicial representa documentación, contratos y tooling. No convertir una relación planeada en evidencia de implementación.

`graphify-out/graph.json`, GRAPH_REPORT.md y graph.html son locales e ignorados; se regeneran desde fuentes versionadas. Abrir graph.html en navegador para explorar comunidades. El manifiesto context-manifest.json registra fecha, HEAD, si había cambios y hashes de documentos.

## Uso por agentes y actualización

Consultar primero con presupuesto pequeño, seguir source_file/source_location y comprobar fuente. El grafo no reemplaza AGENTS, spec, contratos ni tests. Si una búsqueda falla, usar rg dirigido; nunca bloquear implementación por ausencia del grafo.

**Un solo escritor:** coordinador reconstruye al integrar un bloque. No ejecutar watch, hooks de auto-update ni rebuild desde el auxiliar. El script usa lock contra ejecución accidental simultánea y respeta el guard nativo que impide reducir nodos sin revisión. Si terminó con error, verificar que no haya proceso vivo antes de retirar un lock residual.

Usar `./tools/graphify rebuild` para refrescar tanto docs como AST. El update nativo es AST-only y puede dejar índice documental viejo: no usarlo como sustituto de este rebuild. `rebuild --force` solo después de verificar borrados/refactors intencionales; no como remedio habitual a fallos.

El rebuild detecta archivos con Graphify y excluye skills de terceros, graphify-out, node_modules, builds, .env y material sensible mediante .graphifyignore. No añadir claves, datos de clientes ni saldos reales a documentos indexados. Los catálogos y montos de prueba son ficticios.

## Fuentes oficiales

- [Repositorio e instalación](https://github.com/Graphify-Labs/graphify)
- [Referencia CLI](https://docs.graphify.com/reference/overview)
- [Extracción local](https://docs.graphify.com/reference/extract)

La documentación upstream puede avanzar: para este repo manda la versión fijada y los comandos que hayan sido verificados.
