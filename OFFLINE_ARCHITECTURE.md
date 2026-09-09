# Ohnix Offline-First — Arquitectura

Cómo Ohnix sigue funcionando cuando se corta la conexión, cómo sincroniza al volver, y qué hacer para agregar un módulo nuevo a este sistema.

> Principio de diseño: **ONLINE cuando hay internet. OFFLINE cuando no la hay. SINCRONIZADO cuando vuelve.** La pérdida de conexión es un estado operativo normal, no una excepción. El usuario nunca debería sentir que "Ohnix dejó de funcionar".

Este documento cubre el diseño real, tal como quedó implementado (Etapas 0–5). No es un plan aspiracional — cada afirmación aquí corresponde a código que existe y fue probado en vivo (build de producción real + navegador headless, sin mocks de la lógica de la app).

---

## 1. Resumen de la arquitectura

```
CLIENTE (con internet)
  └─ Mutación → API real → servidor → BD → respuesta
  └─ Lectura online → API real → se refleja también en el espejo local (write-through)

CLIENTE (sin internet)
  └─ Mutación → se aplica de forma optimista al espejo local (Dexie) → se encola en el outbox
  └─ Lectura → se sirve desde el espejo local (Dexie), nunca se intenta la red

CLIENTE (reconecta)
  └─ ConnectivityManager confirma conexión real (no solo navigator.onLine)
  └─ Sync Engine: (1) refresca espejos registrados → (2) drena el outbox en orden
  └─ Cada mutación reproducida usa la MISMA Idempotency-Key que se generó al encolarla
  └─ Éxito → se reemplaza el registro optimista por el real del servidor
  └─ Rechazo determinístico (409/422/etc.) → CONFLICT, nunca se reintenta solo
  └─ Falla de red → ERROR, se reintenta automáticamente sin perder el resto de la cola
```

Toda la infraestructura vive en `Frontend/src/offline/`:

| Archivo | Responsabilidad |
|---|---|
| `db.js` | Esquema Dexie (IndexedDB), versiones, limpieza por cuenta/logout |
| `connectivity.js` | Sabe si de verdad hay conexión (no solo `navigator.onLine`) |
| `outbox.js` | Cola de mutaciones pendientes: estados, altas, reintentos |
| `entityQueue.js` | Helpers genéricos para leer/escribir el espejo y encolar create/update/delete |
| `syncEngine.js` | Orquesta el pull de cada entidad + el drenado del outbox al reconectar |
| `entitySync.js` | Registro de qué entidades tienen "pull" de resincronización completa |

Del lado del servidor, no se creó nada nuevo: se **reutilizó y extendió** la infraestructura de idempotencia que Ohnix ya tenía (`Backend/prisma/schema.prisma` → modelo `IdempotencyKey`, `Backend/middleware/idempotency.middleware.js`). Ver sección 6.

---

## 2. Qué se guarda en el dispositivo (IndexedDB vía Dexie)

Base de datos: `ohnix-offline` (una por navegador, ver sección 8 sobre aislamiento por cuenta).

### 2.1 Tablas de control

| Tabla | Forma | Para qué |
|---|---|---|
| `outbox` | `{ localId, entity, opType, request, idempotencyKey, status, attempts, lastError, lastAttemptAt, remoteId, localTempId?, recordId?, ...meta }` | La cola de mutaciones pendientes. Ver sección 3. |
| `syncCursor` | `{ entity, cursor, updatedAt }` | Un registro por entidad con "pull" registrado — guarda cuándo fue la última resincronización completa (el `cursor` es hoy solo un timestamp nominal, ver 2.3). |
| `meta` | `{ key, value }` | Bookkeeping suelto — hoy solo guarda `currentAccountId` (ver sección 8). |

### 2.2 Tablas espejo (mirror) por módulo

Cada fila se guarda **exactamente como la API la devuelve** (mismo `_id`, mismos nombres de campo snake_case) — así un componente no necesita traducir nada según lea de la red o del espejo.

| Tabla | Clave primaria | Tipo de espejo | Por qué |
|---|---|---|---|
| `products` | `_id` | Completo | `GET /products` no pagina |
| `categories` | `_id` | Completo | ídem |
| `units` | `_id` | Completo | ídem |
| `customers` | `_id` | Completo | ídem |
| `suppliers` | `_id` | Completo | ídem |
| `purchases` | `_id` | Completo | `GET /purchases` no pagina |
| `cashAccounts` | `_id` | Completo | catálogo pequeño |
| `pointsOfSale` | **`id`** ⚠️ | Completo | `GET /points-of-sale` es de las pocas rutas que devuelve la fila cruda de Prisma, no el mapeo `_id`/snake_case habitual |
| `stockTransfers` | `_id` | Completo (con tope de 200 del propio servidor) | `GET /stock-transfers` sin filtros ya trae "todo lo visible" |
| `purchaseQuotations` | `_id` | Completo | no pagina |
| `salesQuotations` | `_id` | Completo | no pagina |
| `orders` | `_id` | **Parcial (page-cache)** | `GET /orders` **sí** pagina — ver 2.3 |
| `locationStockSummaries` | `_id` (= id de producto) | Parcial, inventado | no existe un endpoint "tráeme el resumen de todos los productos" |

> ⚠️ **Nota para el próximo módulo que se agregue**: no asumir que toda respuesta usa `_id`. `pointsOfSale` es la excepción confirmada. Antes de declarar la tabla, revisar el controller real.

### 2.3 Espejo completo vs. caché parcial

Dos módulos son deliberadamente **parciales**, no espejos completos:

- **`orders`**: `GET /orders` pagina server-side y un negocio establecido puede tener miles de órdenes — no tiene sentido (ni cabe) traer "todo el historial" a IndexedDB. En su lugar, `useOrders.js` hace *write-through*: cada página que el usuario ya vio online se escribe en el espejo (`mirrorUpsertMany`, no reemplaza lo demás). Fuera de línea, la lectura es "lo que ya se vio", no "el historial completo" — y así se comunica en el indicador de estado (sección 9).
- **`locationStockSummaries`**: no es una lista real de la API, es el resumen por-producto de `GET /products/:id/location-stock`. Se guarda una fila por cada producto que el usuario haya abierto, bajo su propio id.

Todo lo demás (`products`, `categories`, `units`, `customers`, `suppliers`, `purchases`, `cashAccounts`, `pointsOfSale`, `stockTransfers`, `purchaseQuotations`, `salesQuotations`) es un **espejo completo real**: `entitySync.js` registra un "pull" que hace `GET` sin filtros y reemplaza toda la tabla (`mirrorReplaceAll`). No es sincronización incremental por `updatedAt` — se evaluó y se descartó porque ninguno de estos endpoints soporta un filtro `updatedSince` hoy, y a la escala de una pyme (cientos, no millones de filas) un refetch completo en cada reconexión es rápido y mucho más simple que construir un protocolo de deltas. Si el catálogo de algún cliente crece lo suficiente para que esto duela, ahí se justifica la incremental — no antes.

---

## 3. El outbox (cola de operaciones)

Cada mutación hecha estando offline se convierte en una fila de `outbox`:

```js
{
  localId,             // autoincremental, clave primaria de Dexie
  entity,              // "products", "orders", "cashAccounts", ...
  opType,               // "create" | "update" | "delete" | "custom"
  request: { method, url, data, isFormData? },
  idempotencyKey,       // crypto.randomUUID(), generado UNA VEZ al encolar
  status,               // PENDING | SYNCING | SYNCED | ERROR | CONFLICT
  attempts, lastError, lastAttemptAt, remoteId,
  localTempId?,         // solo en creates: el id temporal a reemplazar al sincronizar
  recordId?,            // solo en deletes/acciones: el id real afectado
}
```

### 3.1 Por qué la Idempotency-Key se genera al encolar, no al reintentar

`Frontend/src/utils/idempotency.js` ya generaba una key por click (`idempotencyHeaders()`), pero esa key era efímera — no sobrevivía un reload. El outbox la genera **una sola vez, al crear la entrada**, y la persiste junto con la fila. Cada reintento (automático o tras un reload) reutiliza la misma key. Esto es lo que le permite al backend reconocer "esta operación ya la procesé" incluso si el cliente cree que falló (ver sección 6).

### 3.2 `queueCreate` / `queueUpdate` / `queueDelete` (`entityQueue.js`)

Son los tres helpers que todo hook usa para encolar sin repetir lógica:

- **`queueCreate`**: genera un id temporal (`offline-<uuid>`), construye un registro optimista (`{...campos enviados, ...optimisticExtra, _id: tempId, _pendingSync: true}`) y lo escribe de inmediato en el espejo — así el usuario lo ve en la lista al instante. `optimisticExtra` es **solo visual**, nunca se manda al servidor (por ejemplo, rellenar `created_by` o el nombre del cliente elegido, que la API real adjunta pero un simple POST no incluye).
- **`queueUpdate`**: mezcla el patch sobre el registro que ya existía en el espejo (no sobre uno vacío), así los campos que el formulario no toca (nombre de categoría, `created_by`, etc.) no desaparecen hasta el próximo sync. Acepta `optimisticPatch` para acciones cuyo cuerpo de request no se parece en nada al registro (ej. `adjust-stock` manda `{delta, reason}`, pero lo único que cambia visualmente es `stock`).
- **`queueDelete`**: **no borra la fila del espejo** — la marca `_pendingDelete: true`, lo que la oculta de `readMirrorAll()` de inmediato (se ve como borrada) pero conserva el dato. Si el servidor rechaza el borrado al sincronizar (ej. `product_has_history`), se revierte la marca y el registro reaparece. Un borrado duro antes de la confirmación del servidor sería irreversible si el rechazo llega después.

Para acciones que no calzan en create/update/delete (una transferencia rápida de stock, un pago, una transferencia entre cuentas de caja), se usa `enqueueOperation` directo con `opType: "custom"` — se encola la petición pero **no se inventa ningún efecto optimista sobre inventario o dinero** (ver sección 5).

---

## 4. Motor de sincronización (`syncEngine.js`)

```
runSync()
  ├─ pullAllRegisteredEntities()   // refresca cada espejo registrado, EN PARALELO de fallos
  └─ drainOutbox()                  // reproduce las mutaciones pendientes, en orden de creación
```

Se dispara automáticamente:
- Al confirmar conexión real (`ConnectivityManager` → evento de reconexión).
- Al montar `DashboardLayout` si ya hay conexión.

**Nunca requiere que el usuario presione "Sincronizar".**

### 4.1 Por qué el pull de cada entidad está aislado con try/catch

Bug real encontrado durante las pruebas: si el pull de **una sola** entidad fallaba (ej. `GET /stock-transfers` devuelve 403 en una cuenta sin el plan `multiLocation`), la excepción interrumpía el `for` de `pullAllRegisteredEntities` **antes de llegar a `drainOutbox()`** — es decir, una cuenta sin ese plan jamás sincronizaba nada (ni ventas, ni productos, nada), sin ningún error visible. Corregido: cada pull tiene su propio try/catch y solo hace `console.warn`. El drenado del outbox **siempre** corre, sin importar qué pulls fallaron.

### 4.2 Reproducir una mutación (`replayOutboxEntry`)

1. Marca la fila `SYNCING`.
2. Si el request original era `multipart/form-data`, reconstruye un `FormData` real desde el array `[key, value][]` guardado (ver 4.3).
3. Llama a la API real con el mismo `method`/`url`/`data`, agregando el header `Idempotency-Key` persistido.
4. Éxito → `reconcileMirrorAfterSync`: si era un create, borra el registro temporal y guarda el real devuelto por el servidor; si era un update, sobreescribe con la versión canónica; si era un delete, ahora sí borra la fila del espejo.
5. Rechazo determinístico (4xx) → `markConflict` + `reconcileMirrorAfterConflict` (revierte un delete marcado, deja el create/update visible con `_pendingSync: true` para que el usuario lo corrija).
6. Falla de red/5xx → `markError`, **se detiene el drenado del resto de la cola** (si la red se cayó, seguir intentando las siguientes solo va a fallar igual) y se retoma en el próximo intento de reconexión.

### 4.3 Archivos en el outbox (FormData)

Varios formularios (producto, cliente, proveedor) mandan `multipart/form-data` con una foto opcional. `FormData` no es serializable en IndexedDB directamente, pero sus entradas sí (`File`/`Blob` son estructuras clonables nativas). `entityQueue.js` convierte `FormData` ↔ `[[key, value], ...]` al encolar/reproducir — una foto adjuntada estando offline sobrevive un reload y se sube igual al sincronizar.

### 4.4 Refrescar la UI después de sincronizar

`subscribeSyncCompleted(callback)` se dispara cuando el ciclo completo (pull + drain) termina — **no** cuando la conexión "vuelve". Esto también fue un bug real: si un hook refrescaba apenas detectaba conexión, podía ganarle la carrera al drenado del outbox, mostrar la lista todavía vieja del servidor, y nunca volver a mirar — aunque el propio sync que agregaría el pedido creado offline terminara un segundo después. Todos los hooks (`useProducts`, `useOrders`, `usePurchase`, `useCashAccounts`, `useQuotations`, `LocationStockPanel`, `StockReport`, etc.) se suscriben a esta señal, no a la de conectividad cruda.

---

## 5. Conflictos — quién decide

**Principio explícito: el cliente nunca decide "quién gana" sobre inventario o dinero. El servidor ya es la autoridad** (lock pesimista real en `ProductLocationStock`, `Serializable` en las cuentas de caja — infraestructura que ya existía en Ohnix antes de este trabajo). El offline nunca le agrega un algoritmo de merge nuevo a esa parte.

Por eso, para toda acción que mueve stock o dinero de forma no trivial (traslado rápido, transferencia entre cuentas, ajuste de caja, convertir una cotización en orden), el cliente **solo encola la acción** — nunca simula el resultado. La cifra visible (saldo, stock) se queda en el último valor confirmado hasta que el sync real la actualice.

Para lo demás, la fila queda en uno de estos estados y así se comunica al usuario:

| Estado | Significado | Se reintenta solo? |
|---|---|---|
| `PENDING` | Encolada, esperando conexión | — |
| `SYNCING` | Reproduciéndose ahora mismo | — |
| `SYNCED` | Confirmada por el servidor | — |
| `ERROR` | Falla transitoria (red, 5xx) | Sí, en el próximo ciclo de sync |
| `CONFLICT` | El servidor la rechazó por una razón de negocio (409 `stale_edit_conflict`, 422 stock insuficiente, `product_has_history`, número duplicado, etc.) | **No** — requiere que el usuario la corrija y reenvíe |

Ejemplo real de la matriz original: una venta `completed` creada offline que, al sincronizar, no tiene stock suficiente porque alguien más vendió lo mismo mientras tanto → queda en `CONFLICT`, nunca se auto-cancela ni se fuerza.

---

## 6. Idempotencia — cómo cooperan cliente y servidor

Ohnix **ya tenía** un sistema de idempotencia real antes de este trabajo:

- `Backend/prisma/schema.prisma` → modelo `IdempotencyKey` (único por `[accountId, scope, key]`).
- `Backend/middleware/idempotency.middleware.js` → `idempotent(scope)`: si llega una key que ya se procesó con éxito, devuelve la misma respuesta guardada en vez de repetir la operación. Si una key quedó "a medias" (el proceso murió entre el commit y la respuesta), hay una ventana de 2 minutos antes de permitir que se reclame de nuevo.

Lo que se hizo fue **extender la cobertura** a las rutas que no la tenían, reutilizando exactamente el mismo middleware — ningún diseño nuevo del lado del servidor:

- CRUD de producto, cliente, proveedor, categoría, unidad.
- Crear compra, cotización de compra (crear/editar), cotización de venta (crear/enviar/**convertir**).
- Registrar pago de venta y de compra, gasto e ingreso manual.
- Las 4 transiciones de traslado de stock que no lo tenían (`approve`/`ship`/`receive`/`cancel`).

El outbox del cliente adjunta su `idempotencyKey` persistida en cada reintento — si una venta se creó en el servidor pero la respuesta nunca llegó al cliente (conexión cortada a mitad de la respuesta), el reintento automático **no crea una segunda venta**: el servidor reconoce la key y devuelve la venta ya creada.

---

## 7. Inventario — qué modelo asume el cliente

El inventario en Ohnix ya era un modelo híbrido caché+ledger (no se tocó su diseño):

1. `StockMovement` — ledger append-only, nunca se actualiza.
2. `ProductLocationStock.stock` — saldo autoritativo por producto+ubicación, con lock pesimista real (`SELECT ... FOR UPDATE`).
3. `Product.stock` — caché agregada de todas las ubicaciones.

El cliente offline **nunca decrementa stock por su cuenta**. Al crear una venta/compra offline, el registro optimista muestra el stock *anterior* sin tocarlo — el descuento real ocurre en el servidor, dentro de la misma transacción atómica de siempre, cuando el outbox sincroniza. Si el servidor determina que ya no hay stock suficiente, la operación queda en `CONFLICT` (sección 5), nunca se "arregla sola" restando de otro lado.

Refuerzo de backend hecho en este trabajo: `stockTransfer.service.js` (`approveTransfer`/`shipTransfer`/`receiveTransfer`/`cancelTransfer`) no tenía el mismo guard atómico contra doble-procesamiento concurrente que ya usaban `order.service.js`/`purchase.service.js` (un `updateMany({where:{id, status:<esperado>}})` en vez de un `update` incondicional). Se alineó al mismo patrón — un cambio pequeño, no una arquitectura nueva.

---

## 8. Autenticación y seguridad de los datos locales

- **Aislamiento por cuenta**: `resetOfflineDataIfAccountChanged(accountId)` compara la cuenta actual contra `meta.currentAccountId`; si cambian (otra persona inicia sesión en el mismo navegador), se borra todo el IndexedDB antes de guardar nada nuevo. Se llama desde `DashboardLayout` en cuanto se conoce el usuario.
- **Logout explícito**: `clearOfflineDataOnLogout()` limpia todas las tablas espejo + el outbox. Un logout intencional sí borra las operaciones pendientes (a diferencia de una sesión que expira sola — ver limitación abajo).
- **Qué NO se guarda**: refresh token, datos de tarjetas (Ohnix no los captura), y nada que los endpoints de lectura no devuelvan ya hoy online. El scoping de qué le toca ver a cada usuario **no se reimplementa** del lado offline — se hereda: el cliente solo espeja lo que la misma ruta protegida por `requireModulePermission`/`pos.permissions.js` ya le devolvió estando online. Un usuario restringido nunca ve offline algo que no vería online.

### Limitación conocida y no resuelta: sesión que expira estando offline

`AuthContext.checkAuthStatus()` sigue llamando a `GET /users/current-user` al montar la app, y si esa llamada falla por falta de red, hoy limpia el usuario igual que si el 401 fuera real — mostrando la pantalla de login aunque la sesión siga siendo válida. Arreglarlo bien requiere persistir un snapshot de usuario/equipo/permisos en Dexie (para poder renderizar `hasPermission` sin red) y distinguir "no puedo confirmar" de "el servidor dijo que no" — quedó **deliberadamente fuera de alcance** de las Etapas 0–5 para no tocar el flujo de auth sin la superficie de prueba real (haría falta que algún módulo ya dependiera de ese snapshot para poder probarlo con datos reales, no solo en teoría). Mientras tanto: si el usuario **no recarga la pestaña** mientras está offline, esto nunca ocurre — el problema es específico a abrir/recargar la app ya sin conexión.

---

## 9. Indicador de conexión (UI)

`Frontend/src/components/common/SyncStatusIndicator.jsx`, montado en `DashboardHeader`. Discreto, nunca bloquea la pantalla, no genera popups:

| Estado | Texto |
|---|---|
| Conectado, nada pendiente | (no se muestra nada) |
| Sin conexión | "Sin conexión · Trabajando offline" |
| Sincronizando | "Sincronizando..." |
| Hay pendientes | "N cambios pendientes" |
| Hay algo en `CONFLICT` | "Algunos cambios requieren atención" |

En Reportes (`Reports.jsx`) hay además un aviso específico cuando está offline, explicando que solo el reporte de Stock funciona sin conexión y por qué los demás no (ver sección 11).

---

## 10. App shell instalable (Service Worker)

Se agregó `vite-plugin-pwa` para que la aplicación **abra siquiera** sin red (antes de este trabajo, sin service worker, una pestaña sin caché de la app no cargaba nada). El service worker (`Frontend/src/sw.js`) es **exclusivamente** para los assets estáticos (JS/CSS/HTML) vía Cache Storage — nunca para datos de negocio, que viven solo en Dexie (sección 2). Se registra únicamente dentro de `DashboardLayout` (el shell autenticado), nunca en marketing/login.

> Nota de coordinación: `sw.js` fue evolucionando en paralelo por otra sesión de trabajo (debugging de hidratación en producción) y hoy incluye un guard de Content-Type contra assets corruptos, `clients.claim()`, y un handshake de actualización manual (toast "Hay una nueva versión disponible"). **No tiene `navigateFallback`** — fue removido deliberadamente porque causaba el bug de hidratación que se estaba debuggeando, y su reintroducción está pendiente de un cambio en el orden de build (`app.html` se genera después del manifest de precache). Esto significa: **recargar la pestaña estando genuinamente offline no funciona hoy** — el navegador intenta una navegación real y falla. Mientras el usuario no recargue el navegador sin conexión, todo funciona; si lo hace, no pierde datos (reabrir con conexión los muestra ya sincronizados), pero sí pierde la pestaña actual.

---

## 11. Qué es offline y qué no — matriz final por módulo

| Módulo | Leer | Crear | Editar | Eliminar / estado | Notas |
|---|---|---|---|---|---|
| Productos | ✅ | ✅ | ✅ | ✅ (soft-delete) + ajustar stock (delta) | Subir/reordenar/eliminar imágenes: solo online |
| Categorías / Unidades | ✅ | ✅ | ✅ | ✅ | — |
| Clientes / Proveedores | ✅ | ✅ | ✅ | ✅ | "Mover de sede": solo online |
| **Ventas (Orders)** | ✅ (parcial, ver 2.3) | ✅ (pending/processing/completed) | Cambiar estado: ✅ (solo si ya se conoce localmente) | — | Registrar pago: ✅ (acción, sin efecto optimista). Devoluciones: solo online. Factura DIAN: ya era fire-and-forget, no necesitó cambios |
| Compras | ✅ | ✅ | Cambiar estado: ✅ | — | Registrar pago: ✅ (acción). Devoluciones: solo online |
| Cotización de compra | ✅ | ✅ | ✅ | Recibir/rechazar: ✅ | — |
| Cotización de venta | ✅ | ✅ | Enviar: ✅ | Convertir a orden: ✅ (acción, sin efecto optimista) | — |
| Cuentas de caja | ✅ | ✅ | ✅ | Desactivar: ✅ | Transferencia entre cuentas y ajuste: ✅ (acción). Conciliación bancaria y gasto/ingreso manual del cajón de conciliación: solo online |
| Traslados de stock | ✅ | Solicitar: ✅ (no toca stock) | Aprobar/Enviar/Recibir/Cancelar: ✅ (solo estado, nunca stock) | — | Traslado rápido: ✅ (acción, sin efecto optimista) |
| Reportes | Solo Stock: ✅ (estimado, ver §11.1) | — | — | — | Todo lo demás: requiere conexión, con aviso explícito |
| Equipo / Roles / Permisos | — | — | — | — | Nunca offline — sensible a seguridad |
| Suscripción / Facturación SaaS | — | — | — | — | Requiere Stripe/ePayco en vivo |
| Integraciones / API Keys / Webhooks | — | — | — | — | Baja frecuencia, requiere validación en vivo |
| Login inicial | — | — | — | — | Obvio |

### 11.1 Reporte de Stock offline — qué es exacto y qué es estimado

Calculado desde el espejo de `products`. El estado (Agotado/Bajo/En stock) usa el mismo umbral por producto que el servidor; si el producto no tiene umbral propio, se usa `10` como default fijo — el servidor en realidad consulta `SystemSetting.lowStockDefaultThreshold` (ajustable por un admin) y un override opcional por cuenta (`Subscription.lowStockThreshold`), ninguno de los dos se espeja localmente. El **valor de inventario** mostrado offline es `stock × precio_de_compra` — una aproximación; el valor real del servidor es un costo promedio ponderado por ubicación que tampoco se espeja. Ambas simplificaciones están declaradas en el propio texto que ve el usuario ("El valor de inventario es un estimado...").

---

## 12. Cómo agregar un módulo nuevo a este sistema

Receta corta, siguiendo el mismo patrón que los quince módulos ya cableados:

1. **Confirmar el shape real de la API** — no asumir `_id`/snake_case, mirar el controller (`mapX` function) tal como se hizo aquí. Confirmar qué campos son autogenerados por el servidor (no pisarlos en `optimisticExtra`) vs. cuáles el usuario escribe (esos van en `fields`, no en `optimisticExtra` — error real que se cometió una vez con `purchase_no` y se corrigió).
2. **¿La lista pagina?** Si no pagina → espejo completo: agregar la tabla a `db.js` (bump de versión) + `MIRROR_ENTITIES` + `registerFullResync("entidad", "/ruta")` en `entitySync.js`. Si pagina → tratarla como `orders`: solo write-through (`mirrorUpsertMany`) desde el propio hook, sin pull registrado.
3. **En el hook/página**: al inicio de cada función de fetch, `if (!getConnectivityState()) { leer de readMirrorAll(...); return; }`. Al final del branch online exitoso, escribir a través del espejo (`mirrorReplaceAll` o `mirrorUpsertMany` según el caso).
4. **Mutaciones**: usar `queueCreate`/`queueUpdate`/`queueDelete` (o `enqueueOperation` directo con `opType:"custom"` si es una acción sin registro propio — nunca inventar un efecto optimista sobre inventario o dinero).
5. **Refresh tras reconectar**: suscribirse a `subscribeSyncCompleted(fn)`, nunca a `subscribeConnectivity` directamente para esto (sección 4.4).
6. **Backend**: si la ruta de creación/transición de estado no tiene `idempotent(scope)` todavía, agregarlo — es aditivo, no cambia el comportamiento online existente.
7. **Probar de verdad**: build de producción real (`vite build`) + un stub local simulando la API (nunca contra la base de datos compartida real) + DevTools/CDP en modo offline. Los tres bugs reales de este trabajo (carrera de refresh, placeholder pisando un dato real, un pull fallido rompiendo todo el sync) solo se encontraron probando en vivo — revisar el código no los mostró.

---

## 13. Pendiente — no incluido en este trabajo

- **Suite de pruebas automatizada.** Todo lo de este documento se verificó manualmente (build real + navegador headless) en cada etapa, pero esos scripts eran desechables y se borraron después de cada corrida — no quedó una suite corriendo en el repo.
- **Snapshot de auth en Dexie** para que la sesión sobreviva un reload sin red (sección 8).
- **`navigateFallback`** en el service worker, pendiente del cambio de orden de build que la otra sesión de trabajo dejó documentado en `Frontend/src/sw.js` (sección 10).
- **Panel dedicado de conflictos** — hoy un `CONFLICT` se ve por el conteo en el indicador global y por el registro que sigue visible con `_pendingSync: true`, pero no hay una vista "estos son tus N conflictos, resuélvelos aquí".
