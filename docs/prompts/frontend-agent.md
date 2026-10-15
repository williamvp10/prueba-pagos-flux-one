# Prompt para agente frontend

Copia el bloque en otra sesión abierta en la raíz Git de prueba-pagos-flux-one. No inicia un agente automáticamente.

```text
Implementa el frontend y BFF de Flux One. Hay otros dos frentes paralelos: el coordinador implementa backend/infraestructura y otro agente implementa el riel. Tu propiedad exclusiva es apps/web/** y docs/handoffs/frontend.md.

Antes de editar lee AGENTS.md, docs/collaboration.md, docs/frontend.md y los criterios UI-01..05/AUTH relevantes en docs/spec.md. Consulta ./tools/graphify query "Frontend y sesión browser" --budget 1200 sin reconstruir el grafo. Contratos fuente: docs/browser.openapi.yaml (browser/BFF) y docs/openapi.yaml (servicios privados). No cambies contratos centrales.

ALCANCE Y AISLAMIENTO
- Trabaja exclusivamente apps/web/** y docs/handoffs/frontend.md. Package @fluxone/web.
- No modifiques root manifests/lockfile, infra, Compose, .env, packages, tools, specs, AGENTS ni otros servicios. No hagas git add/commit/stash/reset/checkout/clean ni installs del workspace. No inicies otros agentes.
- Declara dependencias en apps/web/package.json y comunica READY_FOR_INSTALL con la lista en tu handoff; el coordinador instala el workspace. Si generas shadcn con CLI que instala dependencias, hazlo en carpeta temporal aislada fuera del repo y copia solo los archivos que te pertenecen y el manifest necesario. No generes otro repo dentro de apps/web.
- Usa configuración local de Next/TS/Tailwind sin depender de scaffold raíz aún inexistente. Dockerfile standalone dentro de apps/web permitido; Compose lo integra el coordinador.

IMPLEMENTACIÓN
- Node 24, Next.js App Router, React, TypeScript, shadcn con base Radix, Tailwind, Lucide, TanStack Query, React Hook Form/Zod y next-themes. Estilo tecnológico azul, tokens semánticos, tema claro/oscuro/sistema persistido, idioma español, fuente sistema sans.
- Implementa login, registro, cuentas, nueva transferencia, historial y detalle con auditoría/reverso. Seguir rutas/componentes/estados de docs/frontend.md; usa shadcn extensamente, responsive 360/1440px, teclado/foco/labels, contraste AA y reduced-motion.
- Incluye el BFF en apps/web: browser llama /api/v1/* del mismo origen; adapta auth a cookies HttpOnly, sin tokens en body ni browser storage. Verifica Origin en mutaciones contra APP_ORIGIN. Reenvía Idempotency-Key y JWT bearer sin modificar contenido.
- Env solo servidor: AUTH_API_URL=http://auth:3001/api/v1, PAYMENTS_API_URL=http://payments:3002/api/v1, AUDIT_API_URL=http://audit:3003/api/v1, APP_ORIGIN=http://localhost:3000. Para dev fuera de Compose tomar las URLs del .env raíz: localhost:3101/3102/3103; no crear .env propio ni secrets NEXT_PUBLIC_. Puerto web 3000.
- Login llama /auth/login y guarda access/refresh en cookies fluxone_access/fluxone_refresh; retorna solo user/expiresIn. Register retorna User. Refresh lee cookie, rota y actualiza cookies. Logout revoca refresh y limpia cookies. Cookie Secure depende del origen HTTPS, SameSite=Lax, Path=/.
- Bootstrap de cuenta por POST /accounts/bootstrap después de login; si falla sesión sigue válida y hay reintento. GET /accounts solo lectura.
- Coordinador generará @fluxone/api-client con exports de tipos ServicePaths/ServiceComponents y BrowserPaths/BrowserComponents. Puedes declarar dependencia workspace:* y preparar cliente fetch tipado; no editar el paquete compartido. Si aún no existe, registra bloqueo de typecheck en handoff, no dupliques contratos con any.
- No sustituir backend por datos ficticios en producción. Puedes usar fixtures/mocks solo en tests o desarrollo explícito para verificar UI mientras backend arranca.
- Montos string COP, sin float para validación/canonicalización. Generar UUID por intención; conservar key y payload al reintentar. No generar otra key por timeout. POST replay puede ser snapshot viejo: consultar GET.
- Estado casi real por polling 2s mientras transferencia/reverso no terminal; pausar oculto y refrescar al foco. Historial de auditoría eventualmente consistente con estados de sincronización. No mostrar éxito sin confirmar.
- Refresh single-flight y coordinación entre pestañas según docs; no reintentar comandos con key nueva. Errores 401/404/409/422/429/503 con recuperación apropiada. Reverso solo origen COMPLETED sin reverso activo/exitoso, con confirmación UI.
- Añade /api/health para readiness de web. No expongas APIs privadas, tokens o secrets mediante proxies abiertos: whitelist de rutas/verbos, no aceptar URL upstream del cliente.

ENTREGA
- Scripts dev/build/start/typecheck y tests pertinentes. Verifica UI/tema/flujos con tests de browser si entorno disponible; distingue fixtures de integración real. No afirmes checks ejecutados si falta instalación central/backend.
- Actualiza solo docs/handoffs/frontend.md con READY_FOR_INSTALL, READY_FOR_REVIEW o BLOCKED, archivos, dependencias exactas, comandos/resultados, criterios UI cubiertos y pendientes.
- No cambies matriz/ai-log centrales y no hagas commit. Detente tras entregar; el coordinador integra.
```
