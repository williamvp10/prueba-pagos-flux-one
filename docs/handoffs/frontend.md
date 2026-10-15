# Handoff — frontend y BFF

Estado: INTEGRATED / VERIFIED en `main` (`8d0931b` + correcciones de integración).
Rama/worktree de origen: `codex/frontend-agent` en `/tmp/fluxone-frontend-worktree`.

## Rutas de esta entrega

- `apps/web/**`: app Next.js App Router, UI, BFF, configuración local y pruebas unitarias.
- `docs/handoffs/frontend.md`: este handoff.

El coordinador resolvió dependencias desde el workspace raíz y agregó el Dockerfile standalone y healthcheck al Compose; los contratos no necesitaron cambios.

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

## Dependencias instaladas por el coordinador

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

Runtime: Node `>=24`. Las dependencias quedaron fijadas por `pnpm-lock.yaml` y la imagen usa Node 24.11.0.

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
- `pnpm --filter @fluxone/web typecheck` — aprobado desde el workspace integrado.
- `pnpm --filter @fluxone/web build` — aprobado; Next.js generó la salida standalone.
- `pnpm --filter @fluxone/web test` — 3/3 aprobadas.
- Compose aislado confirmó login sin tokens en el body, cookies HttpOnly, lectura de cuentas, transferencia externa, reverso y auditoría mediante el BFF.

## Límite de verificación

No se ejecutó un recorrido automatizado de navegador ni revisión visual de todos los estados claro/oscuro. Los tests actuales cubren dinero y el smoke integrado cubre BFF/servicios; los criterios UI-01..05 permanecen pendientes de evidencia browser.

## Iteración links QR

Estado: INTEGRATED / VERIFIED en `main` (`858f6a1`). El mismo cambio está en el worktree `codex/payment-links-qr` (`2b62ce0`). Instalé `qrcode` y `@types/qrcode` dentro del worktree con `pnpm install --filter @fluxone/web`; ambos quedaron en el lockfile integrado. El typecheck/build de este checkout usaron los `BrowserComponents` nuevos que el coordinador tiene en sus cambios de contrato pendientes; un checkout limpio necesita integrar esos tipos junto al backend de links.

### Rutas y cobertura

- `apps/web/src/app/(portal)/payment-links/page.tsx` y `src/components/payment-links-page.tsx`: listado propio con filtro/continuación por cursor, creación COP con revisión, key/payload de intención en `sessionStorage` y recuperación con la misma key.
- `apps/web/src/app/(portal)/payment-links/[id]/page.tsx`: estado vivo, destino, monto/vencimiento, token solo en memoria para `${origin}/pay#token`, QR con zona blanca, copiar/descargar PNG y cancelación confirmada/idempotente.
- `apps/web/src/app/pay/page.tsx`: ruta fuera de PortalShell; consume y limpia fragmento, login inline, bootstrap recuperable, resumen mínimo, selección de cuenta, confirmación y recuperación de pago. Un 201 abre el detalle de la transferencia.
- `apps/web/src/app/api/v1/[...path]/route.ts`, `src/lib/api.ts`, `src/components/portal-shell.tsx`: whitelist exclusiva de rutas contractuales, destino payments, no redirección opcional para `/pay` y navegación “Cobros”.
- `apps/web/src/lib/payment-links.ts` y `apps/web/tests/payment-links.test.ts`: validación/limpieza de fragmento, link canónico, intención sin token, mapeo seguro de errores y canonicalización COP.
- Dependencias: `qrcode@^1.5.4` y `@types/qrcode@^1.5.5`, declaradas en `apps/web/package.json` e instaladas en el worktree; el lockfile de la rama quedó actualizado.

Criterios abordados: UI-06..09; LINK-01, 02, 03, 05, 06 y 07 por el flujo browser conforme al contrato. UI-08 trata 201 como éxito único y conserva key/payload ante fallos técnicos; el token nunca se incluye en storage ni en errores. El BFF conserva bearer cookie, Origin check, `Idempotency-Key` y `private, no-store`.

### Verificación ejecutada

- `pnpm --dir apps/web test` — pasó, 9/9 pruebas (dinero existente y casos de fragmento, intención, errores y canonicalización).
- `pnpm install --filter @fluxone/web` — pasó en el worktree; el lockfile quedó actualizado con las dos dependencias QR.
- `pnpm --filter @fluxone/web typecheck` — pasó con la dependencia real y los `BrowserComponents` actualizados del checkout del coordinador, copiados temporalmente para verificar la integración. Restauré el archivo generado al estado base al terminar; volver a ejecutar tras integrar los tipos contractuales.
- `pnpm --filter @fluxone/web build` — pasó con Next.js 16.4.1 usando la misma fuente tipada temporal; repetir tras integrar los tipos contractuales.
- No se ejecutó journey de navegador ni verificación visual de breakpoints/temas/zoom; no se reporta como evidencia.

Pendiente de verificación de extremo a extremo: los cambios de payments/contrato que acompañan esta feature siguen en curso en el checkout principal. Tras integrarlos, repetir typecheck/build desde un checkout limpio y verificar BFF/Compose, journey de navegador y revisión visual de breakpoints/temas antes de dar por cubierta la integración completa.
