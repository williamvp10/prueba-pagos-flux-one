# Registro honesto del uso de IA

## Trabajo encargado al agente

- Leer los requisitos del PDF y las aclaraciones del evaluador.
- Proponer stack y arquitectura; convertir decisiones del usuario en specs, contratos, diagramas Mermaid, matriz de pruebas y plan de despliegue.
- Crear la documentación inicial e inicializar historial local de Git.

## Decisiones humanas registradas

NestJS/TypeORM; Next.js/shadcn; API First; Docker Compose/Dokploy y un .env raíz. Usuario aceptó RabbitMQ, registro/sesión, auth_schema, tres usuarios demo (una cuenta cada uno) y reverso interno rechazado si faltan fondos. Eligió estilo tecnológico azul y prioridad Compose/core antes de VPS.

## Errores y correcciones reales del agente

1. En la primera propuesta del mock, el agente agregó `GET /rail/reversals/{reference}`. Tras precisar la aclaración, corrigió el diseño para mantener los tres endpoints: GET de transferencia incluye resultado del reverso. La extensión no llegó a implementación.
2. Durante generación inicial de contratos, un script temporal tuvo una llave de más y Python rechazó ejecutarlo. Se corrigió y se regeneraron archivos; el fallo no demuestra por sí solo validez de los contratos, que se valida aparte.

3. El lint detectó schemas nullable incompletos y campos `from`/`to` mal generados por reutilizar una variable del script. Se corrigieron los contratos y se repitió el lint; la validación es parte necesaria del trabajo generado por IA.
4. El render Mermaid detectó un punto y coma dentro de una nota de secuencia que se interpretaba como separador. Se cambió por coma antes de repetir el render.

## Lo escrito a mano por el usuario

No se ha registrado código escrito manualmente por el usuario. No atribuirle código del agente. El usuario aportó objetivos, decisiones y aclaraciones del evaluador.

## Evidencia inicial y actualización

La fase inicial solo entregaba documentación. Añadir aquí por cada fase implementada comandos/resultados importantes, decisiones nuevas y errores reales corregidos; no declarar pruebas que no se hayan ejecutado.

## Preparación de colaboración y contexto

Se amplió AGENTS y se preparó un prompt con propiedad exclusiva de apps/rail-mock para otra sesión. No se despachó un auxiliar automáticamente. Se instaló la skill oficial Graphify a nivel de proyecto (0.9.62), con wrapper uvx fijado; la instalación global 0.8.20 queda intacta. El grafo combina AST nativo y estructura documental explícita, sin pasada semántica ni API keys.

Durante verificación, el extractor AST devolvió imports externos sin nodo local; se hicieron explícitas y se omitieron esas referencias con conteo en manifiesto antes de validar. La consulta path por defecto respeta dirección incluso para relaciones documentales; el ejemplo de navegación se corrigió a --undirected y se verificó.

## Implementación backend y Swagger

El usuario reservó riel y frontend para agentes externos y pidió Swagger. Coordinador implementó auth/payments/audit, tipos generados, Compose backend, setup/migraciones/seeds y tests. No editó apps/web ni apps/rail-mock; sus handoffs siguen siendo la fuente de estado.

Errores reales encontrados y corregidos: TypeORM UPDATE RETURNING devuelve [rows,count], no una fila directa; la primera suite falló y el rollback protegió dinero. La validación de responses contra OpenAPI encontró reversalStatus nullable sin null en enum. Un ajuste textual de Compose eliminó por error credenciales de audit; el arranque Docker lo detectó y se corrigió con edición estructurada y test de separación de credenciales. El puerto 3001 estaba ocupado y se eligieron puertos dev separados sin detener procesos ajenos.

Comandos y resultados de esa fase: pnpm test (3 unitarias, 13 integración/config, aprobadas); prueba focal de rollback después del débito aprobada; build Docker backend aprobado; Swagger/health de los tres servicios verificados. CI configurado, sin ejecución remota.

## Integración de las entregas auxiliares

El usuario autorizó integrar las ramas `agent/rail-mock` y `codex/frontend-agent` a `main`. El coordinador revisó sus handoffs y diffs, repitió `npm test` del mock (8/8) y `pnpm test` del frontend (3/3), creó commits explícitos en cada rama y luego hizo cherry-pick a main. Los commits integrados son `e6462b9` (riel) y `8d0931b` (frontend). Sin cambios fuera de `apps/rail-mock/**`, `apps/web/**`, sus handoffs y archivos de coordinación/Compose.

La integración encontró un `COPY src` incompatible con el contexto raíz de Compose para la imagen del mock; se ajustó a `apps/rail-mock/src`. La primera compilación TSX encontró un cierre JSX sobrante y el typecheck encontró captura de una promesa antes de inicializarla en el BFF; ambos se corrigieron. El primer healthcheck web encontró que Next guarda `server.js` bajo `apps/web/` en el artefacto standalone del monorepo; se corrigieron el comando y la ruta de assets. Se añadió Dockerfile standalone para Next, dependencias congeladas del workspace, healthchecks y orden de readiness para rail, APIs y portal. El primer smoke Compose encontró puertos host ocupados por procesos/servicios existentes; se parametrizaron los puertos de base de datos/broker y se dejó intacto el proyecto principal. El smoke aislado terminó con login HttpOnly, transferencia externa completada, reverso confirmado y cuatro eventos de auditoría visibles por el BFF.

## Cobertura unitaria de reglas de pago

Ante la solicitud del usuario de ampliar pruebas de reglas de negocio, se agregaron ocho casos unitarios para la liquidación de transferencias y reversos externos (aceptado, rechazado, indisponible e incierto), y dos casos de límites exactos para saldo disponible y crédito máximo. Los tests usan el runner integrado `node:test` y `node:assert/strict`; no se añadieron dependencias. `pnpm test:unit` pasó con 13/13 pruebas de Payments. `pnpm test:all` pasó también: Payments 13 unitarias + 13 integración/configuración, rail-mock 8, frontend 3, typecheck y build de producción. La suite de transición usa un `Transaction` fake para comprobar decisiones y efectos solicitados; PostgreSQL/RabbitMQ siguen cubriendo los comportamientos transaccionales y de integración.
