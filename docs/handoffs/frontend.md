# Handoff — frontend y BFF

Estado: READY_FOR_INSTALL
Rama/worktree: `codex/frontend-agent` en `/tmp/fluxone-frontend-worktree`.

## Rutas de esta entrega

- `apps/web/**`: app Next.js App Router, UI, BFF, configuración local y pruebas unitarias.
- `docs/handoffs/frontend.md`: este handoff.

No se modificaron contratos, infraestructura compartida, manifests raíz ni lockfiles.

## Implementación y criterios

- Auth: registro y login; el browser recibe solo User/expiración. BFF guarda access/refresh en cookies HttpOnly, SameSite=Lax, Path=/ y Secure cuando `APP_ORIGIN` usa HTTPS. Refresh coordinado con Web Locks en browser; el BFF serializa refresh concurrentes por hash temporal del refresh token. Logout revoca refresh y limpia cookies.
- BFF: proxy del mismo origen con whitelist explícita de rutas y verbos; destinos fijos por variable de servidor. Mutaciones requieren `Origin` igual a `APP_ORIGIN`. Conserva payload financiero e `Idempotency-Key`; reintenta una vez luego de refresh ante 401. Incluye `/api/health`.
- AUTH-01/02/06/07/09: registro, mensajes genéricos de credenciales, rotación, logout, bootstrap tras login y reintento de bootstrap si payments falla.
- UI-01: bloqueo de envío en vuelo, UUID por intención y persistencia de payload/clave en `sessionStorage`; resultado incierto permite reintentar con la misma clave.
- UI-02: detalle consulta cada 2 s mientras transferencia o reverso siga no terminal; pausa polling en background. Estado UNKNOWN no se presenta como éxito.
- UI-03: auditoría con vacío/sincronización, lectura manual y reintentos durante hasta 30 s.
- UI-04: tema claro/oscuro/sistema persistido, navegación móvil, foco visible, labels, alertas accesibles y `prefers-reduced-motion`.
- UI-05: APIs del BFF refrescan una sesión una vez tras 401; con Web Locks se coordina entre pestañas. Si no hay soporte para Web Locks se cierra la sesión y se vuelve a login.
- Incluye historial filtrado, detalle de transferencia y reverso con confirmación. Un reverso FAILED permite intentar otra vez con una clave nueva.

## Dependencias para instalación central

Dependencias de `apps/web/package.json`:

- `@fluxone/api-client`: `workspace:*` (cliente generado pendiente en el worktree; imports preparados para `BrowserComponents` y `ServiceComponents`).
- `@hookform/resolvers`: `^5.2.2`
- `@radix-ui/react-alert-dialog`: `^1.1.15`
- `@radix-ui/react-dialog`: `^1.1.15`
- `@tanstack/react-query`: `^5.90.5`
- `class-variance-authority`: `^0.7.1`
- `clsx`: `^2.1.1`
- `lucide-react`: `^0.468.0`
- `next`: `^16.2.0`
- `next-themes`: `^0.4.6`
- `react`: `^19.2.0`
- `react-dom`: `^19.2.0`
- `react-hook-form`: `^7.63.0`
- `sonner`: `^2.0.7`
- `tailwind-merge`: `^3.3.1`
- `zod`: `^4.1.11`

Dependencias de desarrollo:

- `@tailwindcss/postcss`: `^4.1.13`
- `@types/node`: `^24.5.2`
- `@types/react`: `^19.1.13`
- `@types/react-dom`: `^19.1.9`
- `tailwindcss`: `^4.1.13`
- `typescript`: `^5.9.2`

Runtime: Node `>=24`. No se ejecutó install ni se cambió lockfile. El coordinador puede definir el Dockerfile al integrar Compose.

## Configuración de servidor

- `AUTH_API_URL=http://auth:3001/api/v1`
- `PAYMENTS_API_URL=http://payments:3002/api/v1`
- `AUDIT_API_URL=http://audit:3003/api/v1`
- `APP_ORIGIN=http://localhost:3000`
- `PORT=3000`

En desarrollo fuera de Compose se reemplazan los hosts de servicios por `localhost`. No hay `.env` ni variables `NEXT_PUBLIC_*`.

## Verificación

- `pnpm --dir apps/web test` — pasó: 3 pruebas de canonicalización, rango/precisión y formato COP usando enteros exactos.
- `find apps/web -name '*.ts' -not -name '*.d.ts' -print0 | xargs -0 -n1 node --experimental-strip-types --check` — pasó; sintaxis de archivos TypeScript no JSX.
- `node --check apps/web/next.config.ts` — pasó.
- `pnpm --dir apps/web typecheck` — no disponible: `tsc: command not found`; no hay node_modules en este worktree.
- Build y pruebas de browser no ejecutados porque no se instalaron dependencias. `@fluxone/api-client` tampoco está presente en el `HEAD` base de este worktree, por lo que el typecheck seguirá bloqueado hasta que el coordinador integre el paquete compartido y haga la instalación central.

## Pendiente para revisión

Integrar junto al paquete `@fluxone/api-client`, instalar dependencias desde el coordinador y ejecutar typecheck/build. Luego comprobar visualmente claro/oscuro y flujos auth/transferencia/reverso con backend disponible.
