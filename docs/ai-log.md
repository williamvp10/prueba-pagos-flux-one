# Registro honesto del uso de IA

## Trabajo encargado al agente

- Leer los requisitos del PDF y las aclaraciones del evaluador.
- Proponer stack y arquitectura; convertir decisiones del usuario en specs, contratos, diagramas Mermaid, matriz de pruebas y plan de despliegue.
- Crear la documentación inicial e inicializar historial local de Git.

## Decisiones humanas registradas

NestJS/TypeORM; Next.js/shadcn; API First; Docker Compose/Dokploy y un .env raíz. Usuario aceptó RabbitMQ, registro/sesión, auth_schema, dos usuarios demo y reverso interno rechazado si faltan fondos. Eligió estilo tecnológico azul y prioridad Compose/core antes de VPS.

## Errores y correcciones reales del agente

1. En la primera propuesta del mock, el agente agregó `GET /rail/reversals/{reference}`. Tras precisar la aclaración, corrigió el diseño para mantener los tres endpoints: GET de transferencia incluye resultado del reverso. La extensión no llegó a implementación.
2. Durante generación inicial de contratos, un script temporal tuvo una llave de más y Python rechazó ejecutarlo. Se corrigió y se regeneraron archivos; el fallo no demuestra por sí solo validez de los contratos, que se valida aparte.

3. El lint detectó schemas nullable incompletos y campos `from`/`to` mal generados por reutilizar una variable del script. Se corrigieron los contratos y se repitió el lint; la validación es parte necesaria del trabajo generado por IA.
4. El render Mermaid detectó un punto y coma dentro de una nota de secuencia que se interpretaba como separador. Se cambió por coma antes de repetir el render.

## Lo escrito a mano por el usuario

No se ha registrado código escrito manualmente por el usuario. No atribuirle código del agente. El usuario aportó objetivos, decisiones y aclaraciones del evaluador.

## Evidencia y actualización

Esta fase solo entrega documentación. Añadir aquí por cada fase implementada comandos/resultados importantes, decisiones nuevas y errores reales corregidos. No declarar tests de aplicación ejecutados mientras no existan aplicaciones ni suites.

## Preparación de colaboración y contexto

Se amplió AGENTS y se preparó un prompt con propiedad exclusiva de apps/rail-mock para otra sesión. No se despachó un auxiliar automáticamente. Se instaló la skill oficial Graphify a nivel de proyecto (0.9.62), con wrapper uvx fijado; la instalación global 0.8.20 queda intacta. El grafo combina AST nativo y estructura documental explícita, sin pasada semántica ni API keys.

Durante verificación, el extractor AST devolvió imports externos sin nodo local; se hicieron explícitas y se omitieron esas referencias con conteo en manifiesto antes de validar. La consulta path por defecto respeta dirección incluso para relaciones documentales; el ejemplo de navegación se corrigió a --undirected y se verificó.
