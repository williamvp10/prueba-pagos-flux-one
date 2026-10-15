# Prompt para agente frontend — links de cobro QR

Copia el bloque en la sesión del agente frontend abierta en la raíz Git `prueba-pagos-flux-one`. No inicia un agente automáticamente.

```text
Implementa el frontend y BFF de links de cobro QR de Flux One. El coordinador implementa payments, contratos, tipos generados, configuración e integración. Tu propiedad exclusiva es apps/web/** y docs/handoffs/frontend.md.

ANTES DE EDITAR
- Lee AGENTS.md, docs/collaboration.md, docs/frontend.md, LINK-01..08 y UI-06..09 en docs/spec.md.
- Consulta ./tools/graphify query "Frontend y sesión browser payment links" --budget 1200 sin reconstruir el grafo.
- Contrato autoritativo: docs/browser.openapi.yaml. Usa BrowserComponents/BrowserPaths de @fluxone/api-client; no dupliques DTOs manuales.

AISLAMIENTO
- Modifica solo apps/web/** y docs/handoffs/frontend.md. No toques OpenAPI, packages, lockfile, manifests raíz, apps/payments, .env*, Compose, docs centrales, tools ni graphify-out.
- No ejecutes git add/commit/stash/reset/checkout/clean ni installs del workspace. No inicies otros agentes.
- Puedes declarar `qrcode` y sus tipos en apps/web/package.json. Registra READY_FOR_INSTALL y versiones solicitadas; el coordinador instala y actualiza lockfile.
- Conserva la funcionalidad existente y el estilo tecnológico azul. No reformatees archivos ajenos al cambio.

RUTAS Y BFF
- Añade `/payment-links`: listado propio por estado/cursor y creación con cuenta receptora propia, monto COP, revisión e Idempotency-Key estable.
- Añade `/payment-links/[id]`: estado vivo, destino, monto, vencimiento, token compartible solo ACTIVE, QR, copiar link, descargar PNG y cancelación confirmada con key estable.
- Añade `/pay` fuera del PortalShell: lee `window.location.hash`, valida forma/tamaño, retira el fragmento con history.replaceState y conserva token solo en memoria. Si no hay token muestra “Vuelve a abrir o escanear el QR”.
- Amplía whitelist del BFF exclusivamente con verbos/rutas contractuales de payment-links y enrútalos a PAYMENTS_API_URL. Mutaciones mantienen Origin check, bearer desde cookie e Idempotency-Key. Responses siguen `private, no-store` y nunca registran bodies/tokens.
- `/pay` no debe redirigir automáticamente a `/login`: ofrece login inline, bootstrap recuperable y continúa con el token en memoria. Ajusta el helper API con una opción explícita de no redirección ante 401, sin debilitar el comportamiento de las demás páginas.

SEGURIDAD Y ESTADO
- QR/link = `${window.location.origin}/pay#${token}`; no pathname/query. No guardar token en localStorage, sessionStorage, React Query persistido, logs, analytics, toasts ni errores.
- SessionStorage solo puede contener payload no secreto e Idempotency-Key de create/cancel/pay. Una key por intención; timeout/red usa la misma. Resultado definitivo limpia la intención; cambiar payload después crea key nueva.
- `POST /payment-links/resolve` muestra solo monto, COP, código/label destino y vencimiento. Para pagar carga cuentas propias, confirma monto/destino y llama `/payment-links/pay` con token en memoria + sourceAccountId.
- 201 navega a `/transfers/{transfer.id}`. 404 muestra mensaje genérico. 409 distingue EXPIRED/ALREADY_PAID/NOT_ACTIVE según code. INSUFFICIENT_FUNDS, BALANCE_LIMIT_EXCEEDED y SAME_ACCOUNT explican que el link puede continuar activo. Nunca mostrar éxito antes de 201.
- Crear/cancelar/pagar bloquean doble clic. Refresca queries después de mutaciones y al volver foco; no declares estado financiero por reloj local.

UI Y ACCESIBILIDAD
- Usa componentes/tokens/Lucide existentes. Añade “Cobros” a navegación. No introduzcas otra paleta, emojis o fuente remota.
- QR nítido y responsive con quiet zone blanca; ofrece copiar link y descargar PNG como alternativas. Reserva espacio para evitar layout shift.
- Controles táctiles >=44 px, teclado completo, foco visible, labels, AlertDialog, role=alert/aria-live, contraste AA, reduced-motion y estados loading/empty/error/success.
- Verifica 360/375, 768, 1024 y 1440 px, zoom 200 %, tema claro/oscuro/sistema. Mensajes de link inválido/inactivo no deben enumerar existencia o participantes.

PRUEBAS Y ENTREGA
- Añade unitarias para construcción/limpieza segura del fragmento, persistencia de intención sin token, mapeo de errores y canonicalización de monto.
- Si el entorno lo permite, añade browser journey UI-06..09: A crea/descarga QR, B abre e inicia sesión/paga, C no accede después. No uses fixtures como evidencia de integración real.
- Ejecuta tests, typecheck y build disponibles; registra comandos/resultados exactos. No afirmes browser/integ si no se ejecutó.
- Actualiza docs/handoffs/frontend.md preservando el historial previo y agrega una sección “Iteración links QR” con estado READY_FOR_INSTALL, READY_FOR_REVIEW o BLOCKED, rutas, dependencias, criterios, comandos y pendientes.
- Detente al entregar; el coordinador instala dependencias, regenera tipos, integra, ejecuta Compose y hace commits.
```
