# Frontend y sesión browser

## Estructura y estilo

Next.js App Router y TypeScript. shadcn con base Radix, Tailwind y Lucide; componentes instalados mediante CLI del proyecto. TanStack Query para servidor/estado remoto; React Hook Form y Zod para validación de formularios. Cliente de servicios generado de OpenAPI solo en servidor, sin acceso a secretos desde módulos client.

Tecnológico azul, sobrio y legible: fondo neutral, acento azul para acción primaria, tokens CSS semánticos de shadcn. Tema claro/oscuro/sistema con next-themes y preferencia persistida. Tipografía sistema sans para evitar dependencia de red en build. Espaciado base 4/8 px; contenido máximo 1200 px, formularios 640 px. Sin gráficos decorativos ni información financiera ficticia.

Componentes: Sidebar/Sheet para navegación responsive; Card para saldos; Field/Input/Select para formularios; Table, Badge, Pagination para historial; AlertDialog para confirmar reversos; Alert, Empty, Skeleton y sonner para feedback. Usar variantes existentes y etiquetas de estado con texto/iconos, no solo color.

## Rutas y experiencias

| Ruta | Comportamiento |
|---|---|
| /login | Email/password, credenciales erróneas genéricas, loading y link a registro |
| /register | Email y contraseña >=12 y <=128 caracteres; éxito lleva a login |
| /accounts | Bootstrap tras login si hace falta; cuentas propias y balance/reserva/disponible |
| /transfers/new | Origen propio, destino de catálogo, monto COP, confirmación de datos antes de enviar |
| /transfers | Historial paginado con filtros de estado |
| /transfers/[id] | Estado, datos, último reverso, auditoría y reversar si autorizado |
| /payment-links | Links creados por el usuario, filtro de estado, crear cobro y acceso a detalle |
| /payment-links/[id] | Estado, monto, destino, vencimiento, QR/copia/descarga mientras ACTIVE y cancelación |
| /pay | Entrada fuera del portal para consumir el fragmento del QR, autenticar inline, revisar y pagar |

El dashboard `/accounts` ofrece un acceso directo **Crear link de cobro** a `/payment-links#create-link`, sin reemplazar la acción de nueva transferencia. La pantalla de cobros coloca el formulario de creación al inicio.

Internas pueden ir a cuentas ajenas del catálogo; esto no autoriza consultar sus saldos. El botón de reversar solo aparece al propietario del origen, estado COMPLETED y sin reverso activo/exitoso; el backend vuelve a validar.

## Experiencia de links de cobro y QR

### Crear y administrar

- Navegación principal agrega **Cobros** sin reemplazar **Nueva transferencia**. La lista solo presenta links creados por la sesión y estados ACTIVE, PAID, CANCELLED o EXPIRED con texto/icono, no solo color.
- Crear solicita cuenta receptora propia y monto COP. Se muestra una revisión explícita antes de `POST /payment-links`; usa UUID nuevo por intención y conserva key/payload en sessionStorage hasta respuesta definitiva.
- Tras 201 consulta `GET /payment-links/{id}/share-token` y arma en cliente `${window.location.origin}/pay#${token}`. La UI renderiza QR, link copiable y descarga PNG; el texto advierte que cualquier usuario autenticado con la invitación puede ver monto/destino y pagar mientras esté activa.
- El token solo vive en memoria para render/copiar/descargar. No guardarlo en React Query persistido, localStorage, sessionStorage, parámetros de query, pathname, telemetría, toast ni mensajes de error. Al abandonar/refrescar el detalle se solicita de nuevo al endpoint autorizado.
- Cancelar requiere AlertDialog y una key propia persistida durante el intento. PAID/EXPIRED no muestran acción. La lista y el detalle recalculan por GET después de cualquier mutación; el frontend no decide el estado por reloj local.

### Abrir y pagar

- `/pay` está fuera del layout autenticado normal para conservar el fragmento en memoria. Al montar, lee `window.location.hash`, valida solo forma/tamaño, ejecuta `history.replaceState` para retirar el secreto de la barra y nunca lo escribe en storage.
- Si no hay sesión, presenta login inline en la misma ruta. Login exitoso ejecuta bootstrap recuperable y continúa con el token en memoria; no navega a `/login`. Si el usuario recarga después de retirar el fragmento, muestra “Vuelve a abrir o escanear el QR”.
- Con sesión llama `POST /payment-links/resolve`. El resumen muestra únicamente monto, COP, código/etiqueta receptora y vencimiento. No muestra email, nombre del creador, balance receptor, historial ni UUID de cuenta destino.
- El usuario elige una cuenta propia y confirma en un diálogo que repite monto y destino. `POST /payment-links/pay` usa una key estable por intención, deshabilita controles en vuelo y conserva token solo en memoria. Un fallo técnico permite reintentar con la misma key; cambiar cuenta después de un resultado definitivo crea una intención/key nueva si el link sigue ACTIVE.
- Éxito 201 elimina la intención local y navega a `/transfers/{id}`. 404 usa un mensaje común para QR inválido/no activo/sin permiso. 409 distingue expirado, ya pagado o no activo solo cuando el backend lo autoriza; errores de fondos o misma cuenta dejan claro que el link puede seguir activo.

### Contrato visual y accesible

- Reutilizar tokens azules, tipografía sistema, Card, Badge, AlertDialog, Skeleton, sonner y Lucide existentes; no introducir una segunda identidad visual ni colores directos en componentes.
- QR con zona blanca suficiente, tamaño responsive sin reescalado borroso y texto alternativo que explique que codifica un link de pago. Copiar link y descargar PNG son alternativas independientes del escaneo.
- Acciones táctiles mínimas de 44×44 px, foco visible, orden de foco lógico, labels persistentes y errores anunciados con `role=alert` o `aria-live`. Confirmar éxito y ofrecer siguiente paso; todo error incluye recuperación concreta.
- Reservar espacio del QR/skeleton para evitar layout shift. Verificar 360/375, 768, 1024 y 1440 px, zoom 200 %, claro/oscuro/sistema y `prefers-reduced-motion`.

## Sesión y frontera BFF

Browser llama rutas del mismo origen `/api/v1/*`. Next.js enruta por operación a auth, payments o audit. `openapi.yaml` describe APIs privadas; `browser.openapi.yaml` describe browser → BFF. El browser no recibe el body Tokens del servicio auth. Validar ambos al cambiar una ruta, y mantener iguales payloads financieros.

- Registro devuelve User; login/refresh del browser devuelven User + expiresIn (sin tokens). BFF guarda access y refresh en cookies HttpOnly, SameSite=Lax, Path=/, Secure en HTTPS; expiración 15 min y 7 días respectivamente. Logout devuelve 204 y elimina cookies.
- BFF verifica Origin contra APP_ORIGIN en requests mutantes, rechaza origen distinto/ausente salvo entorno de pruebas explícito; backend de servicios no se expone públicamente. No usar wildcard CORS con credenciales.
- BFF añade bearer del access token a servicios. Solo intenta refresh antes de reenviar si recibió 401 de autenticación y no un error de negocio.
- UI coordina refresh mediante un único request en vuelo por pestaña y exclusión entre pestañas con Web Locks cuando esté disponible. Auth serializa rotación; un refresh consumido revoca familia. Si dos pestañas compiten sin soporte de locks, cerrar sesión y pedir login es el fallback seguro v1.
- Bootstrap de cuenta es POST separado tras login, idempotente por propietario. Si falla, sesión sigue válida y pantalla ofrece reintentar.
- Enviar Idempotency-Key desde browser y conservarla íntegra en BFF. Nunca reintentar un comando financiero con nueva key automáticamente.
- Whitelist BFF agrega exactamente los verbos/rutas de payment-links definidos en browser.openapi.yaml. Todas requieren bearer derivado de cookie; resolve sigue siendo autenticado. El BFF nunca construye una URL upstream desde datos del cliente.
- BFF conserva `Cache-Control: private, no-store` para respuestas de links y tokens. `APP_ORIGIN` es la única base válida para compartir; ningún secreto nuevo usa prefijo `NEXT_PUBLIC_`.

## Estados y recuperación

- Generar UUID al confirmar intención; conservar en sessionStorage junto al payload hasta resolver POST. No almacenar tokens allí. Deshabilitar envío durante request.
- Fallo red/timeout no implica fallo del pago: conservar payload/key, permitir recuperar mediante mismo POST. Cambiar datos solo inicia nueva intención cuando la anterior esté resuelta; mostrar advertencia si hay resultado incierto.
- 201 interna: detalle completado; 202 externa: detalle pendiente. Replay puede traer snapshot viejo: consultar GET de inmediato.
- Polling cada 2 s mientras transferencia o reverso esté no terminal. Al ocultarse pestaña, pausar; al recuperar foco, refrescar. Backoff de lectura hasta 30 s ante indisponibilidad.
- Si pago es terminal pero auditoría aún está vacía, refrescar historial durante hasta 30 s; después ofrecer actualización manual y explicar posible demora, sin afirmar pérdida.
- Errores: 401 a login tras refresh fallido; 404 recurso inexistente/sin permiso; 409 mostrar código de negocio; 422 junto al campo; 429 respetar Retry-After; 503 mantener datos y ofrecer reintento.
- Loading, vacío, error y éxito diferenciados en cada pantalla. Fechas se guardan UTC y se muestran America/Bogota; montos con Intl.NumberFormat es-CO y COP.
- Parsear input monetario como texto y normalizar sin float. Validación browser solo ayuda UX; el servidor es autoridad.
- Links ACTIVE no requieren polling continuo en listado; refrescar al foco y después de mutaciones. El detalle puede programar una única invalidación al llegar `expiresAt`, pero siempre confirma el estado por GET.

## Accesibilidad y aceptación visual

Ancho móvil 360 px y desktop 1440 px, navegación por teclado, foco visible, labels asociados, aria-live para cambios relevantes y contrastes AA. Dialog con título y descripción. Respetar reduced-motion y no anunciar cada polling sin cambios. Verificar claro/oscuro/sistema sin flash ni hydration warnings.
