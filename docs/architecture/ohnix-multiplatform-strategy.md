# Ohnix Multiplatform Strategy

Estado: propuesta de investigación/arquitectura. No se implementó nada como parte de este documento. Es una continuación de la iniciativa offline-first (`OFFLINE_ARCHITECTURE.md`, plan en `.claude/plans/joyful-weaving-marshmallow.md`) — este documento no repite esa auditoría, construye sobre sus conclusiones.

---

## 1. Resumen ejecutivo

Ohnix puede convertirse en Web + Desktop + Mobile **sin reescribir el producto**, tratando la app React actual como el núcleo reutilizable en lugar de algo a reemplazar:

- **Desktop (Windows/macOS/Linux): Tauri v2.** Empaquetar la SPA React 18 + Vite + antd actual casi tal cual (~85-95% del código frontend sin tocar). Pequeño (MB, no 100+MB), modelo de seguridad por defecto más estricto que Electron ("default-deny"). Riesgos reales, pero acotados: variación de renderizado en WebKitGTK (Linux) y hardware de POS (impresoras térmicas/cajón de dinero) apoyado en plugins de la comunidad, no oficiales.
- **Mobile (Android/iOS): React Native + Expo.** Una app genuinamente nueva, no un port — antd y react-router-dom no se pueden llevar, solo la lógica de negocio, las validaciones, los permisos y el contrato de API. Alcance de funcionalidades deliberadamente más angosto que Desktop (búsquedas rápidas, escaneo de código de barras, venta rápida, notificaciones — no paridad completa de back-office).
- **Offline + Sincronización: extender el sistema propio existente, NO adoptar RxDB, PowerSync ni ElectricSQL.** Los tres son productos "sync-first"; el requisito real de Ohnix es "la integridad de las reglas de negocio primero, la sincronización después" (el servidor es la única autoridad sobre inventario y dinero vía locks reales de Postgres y transacciones `Serializable` — nunca un merge del lado del cliente). Cada opción de terceros tendría que forzarse a esa forma y trae un costo recurrente nuevo, una dependencia de proveedor nueva, o infraestructura de producción nueva (logical replication de Postgres) que hoy no existe. El propio sistema de outbox + idempotencia + espejo de Ohnix, ya implementado y probado en web, es la mejor base — necesita dos adaptadores de almacenamiento nuevos (Tauri/SQLite, Expo/SQLite), no una arquitectura nueva.
- **El tiempo real ya está construido.** Socket.IO + adaptador Redis, salas segmentadas por cuenta y por ubicación, un evento de invalidación `data:changed` sin payload que dispara un refetch — esto no es un vacío por llenar, es un activo para extender a Desktop y Mobile sin cambios.
- **El backend se mantiene en Node + Express + Prisma + PostgreSQL/Neon.** Nada aquí requiere una base de datos nueva ni un framework de backend nuevo.
- **Monorepo: sí, pero de forma incremental.** pnpm workspaces primero (cambio solo de configuración, cero disrupción del pipeline de deploy en Vercel/Render), Turborepo se agrega en capas cuando aparezca dolor real de rebuild multi-toolchain (su remote cache es gratis), Nx solo si/cuando realmente se necesiten límites de paquetes forzados — no antes.
- **Un problema real que este documento saca a la luz, no señalado antes**: el backend de Ohnix impone **una sola sesión por usuario** (iniciar sesión en un dispositivo nuevo desconecta el anterior). Eso es correcto para "alguien más entró a mi cuenta" pero es el modelo equivocado para "el mismo dueño tiene el Desktop del POS abierto en la tienda Y el celular en el bolsillo" — esto necesita una decisión de producto antes de que Desktop+Mobile salgan al mismo tiempo (ver §29).

---

## 2. Arquitectura actual (verificada contra el código real, 2026-09-10)

### Frontend (`Frontend/`)
- React 18.3.1, Vite 6.1, antd 5.24 (+ `@ant-design/plots`, `@ant-design/icons`), react-router-dom 7.2 (`BrowserRouter`), axios 1.8, dayjs, i18next 26/react-i18next 17 (con `i18next-browser-languagedetector` + `i18next-http-backend`), recharts, socket.io-client 4.8, `html5-qrcode` para escaneo de código de barras, `xlsx` para exportaciones.
- **Sin TypeScript** en ningún lado de la app. Sin librería de manejo de estado (Redux/Zustand/React Query) — cada módulo es un hook hecho a mano (`useState`+`useEffect`+try/catch+toast).
- **La capa offline ya está implementada** (Etapas 0-5 de la iniciativa previa, ver §3): tablas espejo Dexie 4.4 (IndexedDB), un outbox persistido con claves de idempotencia, un motor de sincronización, `vite-plugin-pwa` (estrategia `injectManifest`, `Frontend/src/sw.js` a medida) para un app-shell instalable.
- **La capa de tiempo real ya está implementada**, independiente del trabajo offline: `Frontend/src/live/socketClient.js` conecta Socket.IO al backend en `/api/v1/socket.io`; `useResourcePresence.js` y `useDataInvalidation.js` la consumen para presencia en vivo/soft-locks y avisos de "esta lista puede estar desactualizada, refresca".
- Token de auth: JWT bearer guardado en `localStorage` (`accessToken`), más una cookie (`withCredentials: true`) — un mecanismo de auth **doble** hoy.

### Backend (`Backend/`)
- Node/Express 4 + Prisma 6 + PostgreSQL (alojado en **Neon**, Postgres serverless) — sin capa de repositorio, los servicios llaman a `prisma` directo. 70 modelos de Prisma.
- Multi-tenancy: scope por `accountId` (un `TeamMember` se remapea a la `accountId` del dueño) + scope de ubicación vía `pointOfSaleId` (`middleware/pos.permissions.js`). **`PointOfSale` en este código significa sucursal/ubicación física, no una caja registradora** — no existe una UI de cobro/caja dedicada; lo más parecido a "POS" es el módulo **Orders**.
- Auth: JWT (acceso 1 día / refresh 10 días), `User.tokenVersion` para revocación total, y **una sola sesión por usuario forzada vía Redis** — iniciar sesión en otro lado desconecta la sesión actual (evento `session:replaced`). Permisos: `TeamRole` × `TeamRolePermission` (`none/view/edit/admin`) por módulo, aplicado vía `requireModulePermission`.
- **Ya existe infraestructura de idempotencia real y es estructural**: modelo Prisma `IdempotencyKey` (único por `accountId`+`scope`+`key`) + `middleware/idempotency.middleware.js`, aplicado a ~30 rutas de mutación.
- **El inventario es un híbrido caché+ledger**, no event-sourcing: `StockMovement` (ledger append-only) + `ProductLocationStock.stock` (saldo autoritativo, mutado bajo locks reales `SELECT...FOR UPDATE`) + `Product.stock` (caché agregada). Las operaciones de dinero usan transacciones Postgres `Serializable`. **Esta es la restricción no negociable que define toda la estrategia de sincronización de este documento**: el servidor siempre es el único árbitro de inventario y dinero, por diseño, con control real de concurrencia a nivel de base de datos — no una convención que una capa de sincronización pudiera cuestionar con seguridad.
- **Capa de tiempo real**: `Backend/live/socketServer.js` (Socket.IO + `@socket.io/redis-adapter` para fan-out multi-instancia) + `Backend/live/dataEvents.js`. Dos alcances de sala: `account:<id>` (recursos de toda la cuenta — categorías, clientes, productos, equipo) y `pos:<accountId>:<pointOfSaleId>` (con alcance de ubicación — órdenes, compras, movimientos de stock). Emite un evento `data:changed {resource, action}` **sin payload**; el cliente vuelve a correr el fetch que ya hace al montar. Esto se construyó específicamente porque una auditoría de concurrencia del 2026-08-20 encontró que presencia/locks eran en tiempo real pero ninguna mutación de datos real llegaba a otros usuarios conectados — cierra exactamente el vacío que pregunta el §13 de este encargo, ya en producción.
- Sin motor de colas (sin Bull/Agenda) — `node-cron`/`setInterval` para trabajos en segundo plano. `WebhookDelivery` (backoff fijo `[1,5,30,120,360,1440]` min) es el precedente de reintento durable existente que el outbox offline ya refleja.
- La facturación electrónica DIAN es fire-and-forget (`.catch()`, sin `await`) después de confirmar la orden — ya es el patrón de "efecto local vs. efecto externo" desacoplado que una capa de sincronización necesita.

### Qué NO existía antes de la iniciativa offline-first, y ahora sí
Sin Service Worker, sin manifest de PWA que funcionara, sin IndexedDB, sin cola de operaciones, sin manejo de `navigator.onLine` en ningún lado de la app al inicio de ese trabajo. Todo eso ahora existe — ver §3.

---

## 3. Arquitectura offline-first anterior (resumen, no una re-auditoría)

Totalmente implementada y en producción (solo web), documentada en `OFFLINE_ARCHITECTURE.md`. Decisiones estructurales que este documento hereda sin volver a discutir:

- **Base local: Dexie (IndexedDB)**, elegido por transacciones locales multi-tabla y la reactividad de `useLiveQuery` de `dexie-react-hooks`, por sobre PouchDB/localStorage.
- **Outbox**: cada mutación offline se convierte en una fila con `{entity, opType, request, idempotencyKey, status, attempts, remoteId, localTempId?}`. La clave de idempotencia se genera **una sola vez al encolar** (`crypto.randomUUID()`) y se reutiliza en cada reintento — esto es lo que permite que el middleware `idempotent(scope)` ya existente del backend reconozca una petición repetida como ya procesada.
- **Estrategia de espejo**: reemplazo completo del espejo para catálogos pequeños (productos, clientes, proveedores, etc. — ningún endpoint de estos tiene filtro `updatedSince`, y un refetch completo es suficientemente rápido a escala pyme; la sincronización incremental **se evaluó y se descartó deliberadamente**, no se pasó por alto), write-through paginado para listas grandes (`orders`).
- **Estados de conflicto**: `PENDING → SYNCING → SYNCED`, más `ERROR` (transitorio, se reintenta solo) y `CONFLICT` (rechazo de negocio 4xx determinístico, nunca se reintenta solo — requiere que el usuario corrija y reenvíe). **El cliente nunca resuelve un conflicto de inventario/dinero por su cuenta; solo reporta el resultado autoritativo del servidor.**
- La **detección de conectividad** no confía solo en `navigator.onLine` (un bug real de producción: seguía marcando "online" durante una falla de DNS en un setup con VPN/múltiples adaptadores) — una petición fallida sin `error.response` dispara una reverificación inmediata de alcance.
- **Motor de sincronización**: al confirmar la reconexión, hace pull de todos los espejos registrados (cada uno aislado en su propio try/catch — un pull que falla nunca debe bloquear el drenado del outbox, un bug real que se encontró y corrigió) y luego drena el outbox en orden.
- **Vacíos conocidos y deliberadamente diferidos** (se llevan como pendientes para este trabajo multiplataforma, no como hallazgos nuevos): no hay snapshot de auth/permisos persistido en Dexie (una sesión que expira estando offline fuerza la pantalla de login aunque la sesión siga siendo válida — esto ahora es un problema casi idéntico para React Native, ver §15); todavía no hay `navigateFallback` en el service worker (recargar offline pierde la pestaña actual); no hay suite de pruebas automatizada (toda la verificación hasta ahora ha sido manual, con navegador en vivo); no hay un panel de UI dedicado para resolución de conflictos.

---

## 4. Requisitos multiplataforma

Reformulado del encargo original, mantenido breve ya que los §21-30 responden cada punto en concreto: una app Desktop para Windows/macOS/Linux orientada a usuarios de back-office/POS que trabajan siempre desde un computador; una app Mobile para Android/iOS orientada a dueños/empleados que gestionan el negocio lejos del escritorio; offline donde tenga sentido según la plataforma; todos los clientes sincronizados a través del mismo backend; y sin reescritura — esto tiene que montarse sobre el código real de Ohnix.

---

## 5. Estrategia Desktop

**Recomendación: Tauri v2**, empaquetando la app Frontend existente, no una UI nueva.

Justificación: la SPA existente (React + Vite + antd + react-router-dom) corre dentro del webview nativo del sistema operativo de Tauri esencialmente sin cambios en desarrollo (`npm run dev` sigue sirviendo a través de Vite) y en producción (los assets estáticos compilados se empaquetan en el binario). Esto no es "parecido a Electron" como marketing — las cifras propias de Tauri y reportes independientes son consistentes: bundles típicos de 3-10MB (Electron: 120-200MB) porque usa el webview ya instalado del sistema operativo en lugar de empaquetar Chromium, y comúnmente se reporta (de forma aproximada) 50-75% menos uso de RAM. Ver §6 para la evaluación completa y los cambios de integración concretos requeridos (son reales, pero pequeños).

## 6. Evaluación de Tauri

**Reutilización de código: ~85-95%.** Qué debe cambiar, en concreto — no hipotético:
- Las rutas de assets/`base` de Vite deben resolver correctamente en el origen de producción de Tauri (`tauri://localhost` en macOS/Linux, `http://tauri.localhost` en Windows) — el problema real más comúnmente reportado ("funciona en dev, el CSS no carga en la app compilada") es un problema de rutas de assets, no una incompatibilidad de ruteo. El `BrowserRouter` de `react-router-dom` funciona sin modificación (confirmado por un mantenedor de Tauri).
- Hay que agregar una lista blanca `connect-src` de Content-Security-Policy en `tauri.conf.json` para el dominio de la API y el host de Socket.IO — Tauri inyecta automáticamente nonces de CSP para el JS/CSS empaquetado, pero la lista blanca de red para las llamadas a tu propia API es responsabilidad tuya.
- **Mantener Socket.IO en su transporte de navegador por defecto.** Existe un bug real y reproducido cuando se enruta Socket.IO a través del `@tauri-apps/plugin-websocket` de Tauri (una condición de carrera en el registro de listeners pierde el primer mensaje) — el cliente de sockets de Ohnix (`Frontend/src/live/socketClient.js`) ya usa `socket.io-client` plano, que corre como JS normal de webview y no necesita ningún cambio del lado de Tauri más allá de la entrada de CSP.
- El CSS-in-JS de antd usa selectores de baja especificidad `:where()`; hay que verificar el renderizado específicamente en WebKitGTK de Linux (existe un proyecto de referencia funcionando con antd+Tauri, así que esto es una tarea de verificación, no una pregunta abierta de viabilidad).
- Dexie/IndexedDB **funciona sin modificación** en el webview de Tauri en los tres sistemas operativos de escritorio hoy — no hay migración forzada a un almacén SQLite nativo (esa es una decisión separada y opcional, ver §11).

**Madurez por plataforma**: Desktop (Win/macOS/Linux) es estable desde Tauri 1.0 (2022); v2 estable (oct 2024, línea actual 2.11.x) agregó objetivos móviles pero **el soporte móvil es explícitamente menos maduro** — irrelevante para Ohnix ya que el objetivo aquí es Desktop, no "Tauri también para móvil" (React Native es la respuesta móvil, §7-8).

**Modelo de seguridad — una ventaja real sobre Electron**: el sistema de Capabilities/Permissions/Scopes de Tauri v2 es **default-deny** — cada comando nativo (sistema de archivos, impresora, función Rust personalizada) es inalcanzable desde el webview a menos que se otorgue explícitamente en un archivo de capability, incluyendo tus propios comandos personalizados. Esto es más estricto que Electron, que no tiene un sandbox declarativo de primera clase equivalente (contextIsolation/preload scripts son patrones opt-in que uno mismo configura). El costo es real y continuo — cada función nativa que se expone necesita una entrada de capability + scope — proporcional a cuánta superficie nativa termine usando la app de escritorio de Ohnix.

**Auto-actualizaciones**: el plugin oficial `updater` requiere una versión firmada (clave privada como secreto de CI, nunca en un archivo `.env`) y un manifiesto `latest.json` alojado — auto-hospedable gratis en GitHub Releases o S3. No hay rollout escalonado/por porcentaje incluido; eso habría que construirlo manualmente si se quisiera después.

**Empaquetado/firma**: NSIS/MSI (Windows), `.dmg` firmado con notarización obligatoria vía `notarytool` (macOS — cubierto por la misma membresía de $99/año de Apple Developer, sin costo extra), deb/RPM/AppImage (Linux, sin requisito de firma a nivel de sistema operativo). El costo de firma en Windows es un ítem real y no trivial tras los cambios de política de las CA de feb-2026 (ver §24) — **Azure Trusted Signing (~$10/mes) es la opción pragmática** frente a un certificado EV tradicional (~$280-400+/año), y hay que notar que los certificados EV ya no otorgan un bypass instantáneo de reputación de SmartScreen (ese comportamiento se eliminó en toda la industria en 2024).

**Hardware para el módulo Orders/adyacente a POS** (detalle en §17): los lectores de código de barras casi siempre son dispositivos de emulación de teclado HID y necesitan **cero código de Tauri** — simplemente escriben en el `<input>` que tenga el foco, exactamente igual que en el navegador hoy. Las impresoras térmicas ESC/POS y los cajones de dinero (los cajones se disparan vía el pulso ESC/POS de la impresora, no son una clase de dispositivo separada) **no tienen plugin oficial de Tauri** — existen crates de la comunidad (`tauri-plugin-thermal-printer`, `tauri-plugin-escpos`) y el mecanismo sidecar de Tauri (empaquetar un binario ayudante externo) es el respaldo si ninguno resulta suficientemente confiable. Esto es trabajo de integración real y acotado, no un bloqueo.

**Riesgos conocidos, dichos sin rodeos**: WebKitGTK (Linux) se describe repetidamente en la propia comunidad de Tauri como de menor calidad que WebView2/WKWebView — se citan fallas de animación CSS y rarezas de `contenteditable`, bugs reales, no FUD; las herramientas de debugging difieren por sistema operativo (Windows obtiene herramientas de calidad Edge DevTools, Linux no); el ecosistema de plugins, aunque crece rápido (~47 → 120+ plugins ene 2025 → abr 2026), sigue siendo más pequeño que el ecosistema npm de una década de Electron. **No apareció en esta investigación ningún producto POS/back-office de producción, verificable y con nombre, construido con Tauri** — Ohnix sería un adoptante relativamente temprano para este caso de uso específico, lo cual es un riesgo de referencia real (no fatal) que vale la pena nombrar honestamente en lugar de minimizarlo.

**Conclusión**: sí, empaquetar la app React existente con Tauri. Presupuestar tiempo de integración real (no cero) para configuración de CSP/rutas de assets, archivos de capability, y la capa de hardware de impresora/cajón — pero sin reescritura de UI.

---

## 7. Estrategia Mobile

**Recomendación: React Native + Expo — como una app genuinamente separada**, que comparte lógica de negocio y el contrato de API, no la UI ni la navegación, y que cubre un **conjunto de funcionalidades deliberadamente más angosto** que el back-office de desktop/web (ver §12 sobre por qué "portar las pantallas de desktop más chicas" es el modelo equivocado).

## 8. Evaluación de React Native + Expo

**Qué es reutilizable, en concreto, verificado contra las dependencias reales de Ohnix:**
- Hooks de lógica de negocio que solo llaman a la API y guardan estado, funciones de validación, lógica de verificación de permisos, y el uso de dayjs (JS puro, sin dependencia de APIs del navegador) — todo portable casi tal cual.
- Los archivos de recursos de i18next (`locales/en|es/common.json`) son directamente reutilizables; el **binding** no lo es — `i18next-browser-languagedetector`/`i18next-http-backend` son solo-navegador y necesitan equivalentes de RN (`expo-localization`, JSON empaquetado).
- axios funciona en RN pero no sin fricción: el `fetch` de RN no implementa `ReadableStream`, lo que ha causado regresiones reales en el adaptador fetch de axios (rastreadas upstream) — hay que fijar versiones y preferir el adaptador XHR en lugar de asumir que "simplemente funciona" indefinidamente.

**Qué NO es reutilizable, y esto hay que decirlo sin rodeos**: **antd no tiene equivalente en React Native** — es una librería React-DOM, punto. **react-router-dom no corre en RN** — el ruteo es Expo Router (basado en archivos, la opción por defecto recomendada en 2026 específicamente porque deriva la configuración de deep-links del árbol de archivos en lugar de un mapa de linking mantenido a mano) o React Navigation por debajo. Cada pantalla móvil es código de UI nuevo.

**TypeScript no es obligatorio.** La propia guía de Expo es explícita en que JS plano sigue siendo totalmente viable; las APIs del propio SDK vienen con archivos `.d.ts` para autocompletado incluso en un proyecto `.js`. La fricción es social, no técnica — la mayoría de los ejemplos actuales de librerías de terceros de RN por defecto están en TS, así que adoptar JS plano significa quitar anotaciones manualmente de ejemplos copiados, no un camino bloqueado.

**Persistencia local — el único lugar donde el trabajo offline ya implementado de Ohnix necesita re-ingeniería real, no reutilización:** no hay forma de correr Dexie/IndexedDB en un dispositivo — IndexedDB no existe ahí. Las opciones realistas de RN son `expo-sqlite` (oficial, la más simple, dentro del SDK) o WatermelonDB (basado en SQLite vía JSI, construido específicamente para RN, escala más). **La unidad correcta para compartir no es el motor de almacenamiento, es la lógica del motor de sincronización** — la máquina de estados de `outbox.js`/`syncEngine.js` de Ohnix (generación de clave de idempotencia, transiciones `PENDING/SYNCING/SYNCED/ERROR/CONFLICT`, manejo de rechazo determinístico vs. transitorio, orquestación de pull-luego-drain) casi no tiene superficie específica de IndexedDB hoy — la parte acoplada a Dexie es estrechamente las llamadas de lectura/escritura del espejo. Extraer esa lógica detrás de una pequeña interfaz de adaptador de almacenamiento (`get/put/bulkPut/clear/transaction`) y escribir un adaptador SQLite para RN (y, si Desktop lo necesita después, para Tauri) es trabajo real pero acotado — ver §16 sobre por qué esto es mejor que adoptar un producto de sincronización de terceros.

**Hardware y APIs de plataforma**:
- **Notificaciones push**: el servicio push de Expo es gratis, sin costo por notificación (límite duro de 600/seg/proyecto), abstrae tanto FCM como APNs detrás de una sola API — un backend Node/Express se integra enviando por POST los tokens de dispositivo, sin necesitar el Firebase Admin SDK a menos que se quiera más control fino después.
- **Escaneo de código de barras**: el escáner nativo de `expo-camera` (ML Kit en Android, VisionKit/AVFoundation en iOS) o `react-native-vision-camera` (más performante, activamente debatido cuál es "mejor" — sin consenso del ecosistema, ambos son viables) deberían **superar** al `html5-qrcode` actual de la web (decodificado en JS/WASM contra un stream de video del navegador, sin aceleración de hardware) — esta es una ventaja móvil genuina sobre el escáner web actual, no un retroceso.
- **Bluetooth es el eslabón más débil**: Expo **no tiene ninguna API de Bluetooth de primera parte**. Existen librerías de impresoras Bluetooth ESC/POS de la comunidad, de calidad de mantenimiento despareja, y — crítico — **cualquier librería de Bluetooth requiere un cliente de desarrollo EAS personalizado desde el día uno**, ya que Expo Go no puede cargar módulos nativos fuera del SDK de Expo. Si Ohnix quiere una impresora de recibos por Bluetooth en móvil, hay que planear el flujo de dev-client desde el inicio, no como una sorpresa de "eject" después.
- **Autenticación biométrica** (`expo-local-authentication`, Face ID/huella) es madura y funciona en Expo Go — sin la brecha comparable de Bluetooth.
- **Actualizaciones OTA (EAS Update)**: permiten enviar cambios de JS/assets sin revisión de tienda, pero **no pueden enviar cambios de código nativo** — cualquier módulo nativo o subida de versión del SDK necesita un binario nuevo y revisión completa. El patrón de aplicación de Apple en 2025-2026 (varias apps bloqueadas/retiradas a inicios de 2026) apunta específicamente a apps cuyo JS **genera y ejecuta código nuevo en tiempo de ejecución**, no a actualizaciones de contenido de un bundle JS ordinario — el uso de Ohnix (enviar lógica de negocio/UI actualizada vía un bundle fijo) queda claramente del lado permitido, pero este límite vale la pena declararlo explícitamente en una política interna, no asumirlo.
- **Almacenamiento del token de auth**: `expo-secure-store` (respaldado por Keychain/Keystore, genuinamente protegido por hardware) es la opción correcta, nunca `AsyncStorage` (texto plano, extraíble sin root vía backup de ADB). Como RN no tiene un cookie jar de navegador compartido, la auth móvil es realistamente **solo bearer-token** — lo cual es en realidad una *simplificación* respecto al patrón dual actual de cookie+bearer de la web, no una complicación agregada, siempre que el backend ya acepte peticiones solo-bearer (verificar esto contra el middleware real antes de confiar en ello).

**Costos**: el plan gratis de Expo (15 builds Android + 15 iOS/mes, OTA hasta 1,000 MAU, 100GB de CDN) probablemente cubre el lanzamiento inicial de Ohnix; el techo de 1,000 MAU de OTA — no el volumen de builds — es el gatillo más probable para pasar al plan Production de $99/mes conforme crezca la adopción móvil entre los empleados de los negocios clientes de Ohnix.

**Problemas de producción circa 2025-2026**: la New Architecture (Fabric/TurboModules) ahora es la predeterminada en el flujo managed de Expo — una capa de interoperabilidad cubre la mayoría de las librerías legadas, pero aproximadamente 1 de cada 7 paquetes populares se citan como aún no totalmente compatibles; riesgo bajo para Ohnix específicamente ya que sería una app RN nueva sin código nativo legado que migrar. Hay que esperar que la revisión de App Store rechace por credenciales de demo incompletas o faltantes para una app de negocio multi-tenant (se necesita una cuenta de revisor persistente) y por brechas en la divulgación de privacidad — hay que planear ambas cosas desde el inicio, no como un apuro post-rechazo.

**Por qué mobile ≠ desktop achicado**: la guía actual de UX es consistente en que mobile es una disciplina distinta (alcance del pulgar, atención interrumpida, conectividad intermitente), no un port a escala — el factor decisivo es el comportamiento observado real del usuario, no una regla general. Ver §12 para lo que esto significa en concreto para el alcance de módulos de Ohnix.

---

## 9. Estrategia de código compartido

No tres apps independientes. Un **núcleo compartido** (lógica de negocio, cliente de API, validaciones, verificación de permisos, interfaz de almacenamiento de token de auth, lógica del motor de sincronización, contenido de recursos i18n) consumido por tres capas delgadas por plataforma:

```
packages/
├── api-client/      instancia de axios + interceptores, adaptador de auth-storage intercambiable por plataforma
├── sync-core/        máquina de estados del outbox, lógica de clave de idempotencia, clasificación de conflictos,
│                      orquestación de pull/drain — agnóstico de almacenamiento, solo interfaz de adaptador
├── validation/       validadores compartidos (ya son en su mayoría JS puro hoy)
├── permissions/       lógica tipo hasPermission (espejo de UX de la autoridad del servidor, como hoy)
├── i18n/              recursos de idioma JSON (el binding sigue siendo por plataforma)
└── (después, TS)      types/ solo cuando un paquete compartido realmente necesite tipado estático

apps/
├── web/               el Frontend/ actual, React + Vite + antd + react-router-dom
├── desktop/           capa Tauri alrededor del build de la app web (o un wrapper delgado)
└── mobile/            React Native + Expo, UI nueva + Expo Router, consume packages/*
```

Los adaptadores de almacenamiento específicos de cada plataforma viven dentro de `apps/*` o un pequeño split `packages/sync-core-<plataforma>` (`dexie-adapter`, `tauri-sql-adapter` o Dexie reutilizado, `expo-sqlite-adapter`) implementando la misma interfaz `IMirrorStore`/`IOutboxStore` que define `sync-core`. Esta es la respuesta directa y concreta a "qué compartimos vs. qué reconstruimos": **la lógica y los contratos se comparten, los motores de almacenamiento y la UI no.**

---

## 10. Evaluación de monorepo

**Recomendación: pnpm workspaces ahora; agregar Turborepo cuando aparezca dolor real de rebuild multi-toolchain; evaluar Nx solo si se necesitan de verdad límites de paquetes forzados o generación de código.** Esta secuencia es la recomendación consistente en las fuentes actuales para un equipo pequeño haciendo una migración incremental, no una reescritura de golpe — coincide con el propio enfoque que Ohnix ya usó en el trabajo offline-first.

- **pnpm workspaces (solo)**: minutos de configuración, maneja solo enlace/deduplicación, sin cache de build ni grafo de tareas. Bien como primer paso con solo dos apps y cero paquetes compartidos. Los **Catalogs** de pnpm (estables desde pnpm 9.5) resuelven "mantener la versión de React fijada idénticamente entre web/desktop/tooling adyacente a mobile" sin necesitar ningún orquestador.
- **+ Turborepo**: el más accesible de los dos orquestadores, costo de migración casi nulo desde workspaces solos, y genuinamente agnóstico de toolchain — cachea por hash de archivo + comando declarado con sus inputs/outputs, así que una tarea `cargo build` de Tauri o un build de EAS es simplemente otra tarea cacheada de `turbo.json`, sin necesitar un plugin especial de Rust/Expo (a diferencia de Nx, donde el soporte políglota depende de plugins). **El remote cache de Turborepo es gratis en todos los planes desde dic 2024** (100GB/mes de subidas en el plan gratis), eliminando lo que solía ser la principal objeción de costo.
- **+ Nx**: agrega un visualizador de grafo de dependencias, generación de código, y límites de módulo *forzados* de verdad (ej. una regla de lint que bloquea que `apps/mobile` importe directamente de `apps/desktop`) más ejecución distribuida de tareas de CI. Valor real cuando la cantidad de paquetes y el tamaño del equipo crecen más allá de lo que la disciplina informal puede hacer cumplir — Nx Cloud es gratis para equipos pequeños (50K créditos mensuales, gratis hasta 5 colaboradores) pero se vuelve un costo recurrente por colaborador más allá de eso. No es un requisito del día uno aquí.

**Ruta de migración que nunca rompe el pipeline de producción** (Vercel para el frontend de Vite, Render para el backend de Node, según los deploys actuales):
1. Agregar `pnpm-workspace.yaml` listando las carpetas existentes `Frontend/`/`Backend/` (renombrar a `apps/web`/`apps/api` después si se quiere — un simple movimiento de rutas, sin cambio de lógica). Configurar el **Root Directory** de cada proveedor de hosting a la carpeta de app específica (no a la raíz del monorepo — tanto la documentación de Vercel como la de Render advierten que un Root Directory en la raíz del repo dispara un rebuild completo ante cualquier commit no relacionado), con un comando de install/build que haga `cd` a la raíz del workspace y corra `pnpm --filter <app> build`. Esto es un cambio de configuración; el destino de deploy y la forma del pipeline no cambian.
2. Agregar Turborepo en capas para velocidad de desarrollo local una vez que se sienta la necesidad — no requiere tocar las configuraciones de deploy, ya que Vercel/Render invocan el comando `pnpm` filtrado directamente.
3. Extraer el primer paquete compartido (`packages/api-client` o `packages/sync-core`) solo una vez que exista un segundo consumidor real (la app Tauri o Expo) — no de forma especulativa.
4. Introducir TypeScript **solo dentro de los paquetes compartidos nuevos** conforme se crean — `Frontend/`/`Backend/` pueden quedarse en JS plano indefinidamente; los workspaces de pnpm son agnósticos de tipo de archivo y esta coexistencia está soportada de forma nativa, no es un modo especial.

---

## 11. Estrategia de base de datos local

| Plataforma | Almacén | Por qué |
|---|---|---|
| Web | **Dexie/IndexedDB** (sin cambios) | Ya está implementado, en producción, probado. Sin razón para tocarlo. |
| Desktop (Tauri) | **Dexie/IndexedDB inicialmente** (funciona sin modificación en el webview de Tauri en los tres sistemas operativos) | Sale más rápido, cero reescritura del código de espejo/outbox que ya funciona. Reconsiderar `tauri-plugin-sql` (SQLite, oficial, soporte completo desktop+mobile) solo si/cuando el trabajo de adaptador compartido para React Native hace que un segundo adaptador SQLite sea "gratis" de reutilizar también en desktop, o si las necesidades de consultas relacionales (joins entre órdenes/líneas de detalle para reportes) realmente superan al modelo de object-store de Dexie. |
| Mobile (React Native) | **SQLite** (`expo-sqlite`, oficial/dentro del SDK; WatermelonDB si crecen las necesidades de escala/consulta) | No existe IndexedDB en el dispositivo — no es una elección, es una restricción dura. |

Una librería como RxDB o PowerSync que dice "abstraer esto" se evaluó en §13-16 y se descartó como capa de abstracción — no porque una capa agnóstica de almacenamiento sea mala idea (es exactamente lo que hace `sync-core` del §9), sino porque esos productos específicos empaquetan un protocolo de sincronización/relación de proveedor completo que habría que adoptar entero solo para obtener la abstracción de almacenamiento.

---

## 12. Arquitectura de sincronización

El pipeline propio existente — espejo Dexie/SQLite → outbox (clave de idempotencia al encolar) → motor de sincronización (pull de espejos, drenado de outbox) → resolución de conflictos autoritativa del servidor — se **extiende**, no se reemplaza, entre plataformas:

```
                              Neon PostgreSQL
                    (Prisma, locks reales, transacciones Serializable —
                     única autoridad sobre inventario y dinero, sin cambios)
                                    │
                         API Node/Express + Socket.IO
                      (middleware de idempotencia, salas con
                       scope de cuenta/POS, eventos data:changed)
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
           🌐 WEB               🖥️ DESKTOP             📱 MOBILE
       React + Vite            Tauri (el webview          React Native
       (como hoy)              envuelve la misma          + Expo (UI nueva,
                                app React)                 alcance más angosto)
              │                     │                     │
        Dexie/IndexedDB       Dexie/IndexedDB         SQLite
        (existente)           (inicialmente; SQLite       (expo-sqlite)
                               después si se justifica)
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                     │
                    packages/sync-core (lógica compartida:
              máquina de estados del outbox, manejo de clave de
             idempotencia, clasificación de conflictos, orquestación
              de pull/drain) — el acceso a almacenamiento pasa solo
                por una interfaz de adaptador, una implementación
                          de adaptador por plataforma
```

Esto difiere del diagrama de referencia del encargo en un punto importante: **las flechas hacia "Local DB" no son la misma tecnología idéntica por plataforma** (Dexie vs. eventualmente-quizás-SQLite en desktop, SQLite en mobile) — lo que realmente se comparte e idéntico entre las tres es la lógica de `sync-core` sentada encima de la capa de almacenamiento, más los endpoints/protocolo del lado del servidor. La sincronización no es una sola caja en este diagrama; es un comportamiento compartido implementado contra tres adaptadores de almacenamiento.

## 13. Evaluación de RxDB

Técnicamente el mejor ajuste de "montarse sobre nuestra API Prisma/Postgres existente sin servidor nuevo" de las tres opciones de terceros — su protocolo de replicación está explícitamente diseñado para sincronizar contra *cualquier* backend (tres funciones que la API Express implementaría: `pullHandler`, `pushHandler`, `pullStream$`), sin necesitar un servidor RxDB dedicado. Se descarta de todos modos porque: **el plan gratis es, en la práctica, solo para web.** React Native no tiene IndexedDB, así que el almacenamiento SQLite de nivel producción para RN requiere el plugin de almacenamiento SQLite **pago** de RxDB, y el uso de producción cross-platform desktop+mobile aterriza en **Pro Plus, $239/mes, indefinidamente** — un costo de proveedor recurrente sin techo, por una capacidad (un adaptador de almacenamiento) que Ohnix puede construir una vez y ser dueño de ella. Su modelo de resolución de conflictos por defecto también está orientado a merge del cliente y necesitaría configuración deliberada por colección para forzar "el servidor siempre gana" — alcanzable, pero una cosa más que hay que hacer bien contra un solo proveedor cuyo producto evoluciona, no un ajuste natural de fábrica.

## 14. Evaluación de PowerSync

El más simpático arquitectónicamente de los tres: los Sync Streams mapean naturalmente al scope existente de `accountId`/`pointOfSaleId` de Ohnix, y su ruta de escritura (cola de subida del lado del cliente que drena hacia endpoints del backend definidos por el desarrollador, con el backend pudiendo rechazar una escritura por razones de negocio — su propia documentación usa "rechazar la edición de una orden completada" como ejemplo canónico) es un ajuste genuinamente bueno para "el servidor rechaza, el cliente nunca hace merge". Se descarta por ahora porque requiere **infraestructura de producción nueva y real que hoy no existe**: logical replication de Postgres específicamente en Neon, que auto-expira slots de replicación inactivos tras ~40 horas y puede acumular WAL (arriesgando bloquear escrituras en el primario) si el consumidor se atasca — un modo de falla operativo nuevo sin equivalente hoy. A eso se suma: licenciamiento FSL (source-available con cláusula de no-competencia, no totalmente abierto — riesgo práctico bajo para un SaaS vertical como Ohnix, pero exposición real a un proveedor), y el hecho de que su **SDK de Tauri/Rust es alpha** (explícitamente construido para reemplazar un enfoque anterior más buggy de SDK web dentro de un webview) — prometedor, aún no seguro para producción en una línea de tiempo real. Auto-hospedar (gratis, servicio central con licencia Apache) evita las tarifas de nube pero no la nueva superficie operativa.

## 15. Evaluación de ElectricSQL

Descartado de plano, por razones más allá de "no se necesita todavía": Electric es **sincronización de solo lectura por diseño explícito** — nunca toca escrituras, así que no reemplazaría ni reduciría el sistema de outbox/idempotencia de Ohnix en nada, solo potencialmente la mitad de refetch del espejo. Más importante aún, **la empresa hizo un pivote**: para 2026 se rebautizó en torno a ser "una plataforma de agentes construida sobre sincronización" (niveles Electric Agents/Streams/Sync) y está "uniéndose a Neon en Databricks" — notable ya que el propio Postgres de Ohnix ya está en Neon, pero esto es una empresa reorientándose visiblemente hacia infraestructura de agentes de IA, con incertidumbre real de roadmap para el caso de uso simple de "sincronizar mi app CRUD". Descalificante en concreto hoy: **el soporte de React Native para su almacén local (PGlite) es un issue abierto y sin resolver en GitHub**, y su única integración con Tauri es una demo técnica de 2024 no productizada. No es una respuesta cross-platform creíble para Ohnix en este momento.

## 16. Evaluación de sincronización propia (custom)

**Esta es la ruta recomendada.** La máquina de estados del outbox de Ohnix, la generación/reproducción de clave de idempotencia, la clasificación de conflictos determinístico-vs-transitorio, y la orquestación de pull-luego-drain ya son agnósticas de almacenamiento en esencia — la única superficie acoplada a Dexie son las propias llamadas de lectura/escritura del espejo (upserts masivos, reemplazo completo de tabla, transacciones), que tienen un equivalente semántico cercano en SQLite (también transaccional, también soporta escrituras masivas). Extraer esto en `packages/sync-core` detrás de una pequeña interfaz de adaptador y escribir dos adaptadores de almacenamiento nuevos (Tauri, Expo/SQLite) es trabajo de ingeniería acotado y bien entendido sobre código que Ohnix ya probó correcto en producción — no una apuesta al precio, licencia o roadmap de un proveedor externo, los tres de los cuales han cambiado materialmente en los últimos 18 meses entre las tres alternativas evaluadas arriba. Además requiere **cero infraestructura de backend nueva** — sin logical replication que levantar y monitorear en Neon, sin servicio nuevo, sin modo de falla nuevo. La capa de tiempo real `data:changed` de Socket.IO (§18) y el modelo de idempotencia/locking del servidor no necesitan cambios de ninguna manera.

**Conclusión comparativa** (tabla completa de dimensiones en la investigación que respalda este documento): ninguno de RxDB/PowerSync/ElectricSQL fue construido en torno a "la sincronización es secundaria a la integridad de reglas de negocio forzada por el servidor" — cada uno puede configurarse para respetarlo, ninguno fue diseñado para eso. El sistema propio de Ohnix sí lo fue.

---

## 17. Arquitectura POS

Para el módulo Orders (el POS de facto de Ohnix) en Desktop: **Tauri + (Dexie inicialmente, SQLite opcionalmente después) + el motor de sincronización propio extendido**, no un stack diferente — esta era la pregunta implícita en el §11 del encargo ("¿necesitamos Tauri+SQLite+Sync o algo diferente?") y la respuesta es "la misma app Tauri ya propuesta, con la decisión de almacenamiento diferida según el §11".

Hardware, en concreto:
- **Lectores de código de barras**: la gran mayoría de uso comercial son dispositivos de emulación de teclado HID — no se necesita código de Tauri en absoluto, simplemente escriben en el input con foco exactamente como en el navegador hoy. Un lector de serial/USB-CDC crudo (menos común) usaría el `tauri-plugin-serialplugin` de la comunidad.
- **Impresoras térmicas de recibos + cajones de dinero**: no existe plugin oficial; crates de la comunidad (`tauri-plugin-thermal-printer`, `tauri-plugin-escpos`) cubren impresoras ESC/POS por USB/Bluetooth/TCP y soportan explícitamente el pulso de apertura del cajón (los cajones se disparan a través de la impresora, no es una integración separada). Hay que validar un crate específico contra el/los modelo(s) reales de impresora que usan los clientes de Ohnix antes de comprometerse, y mantener el mecanismo **sidecar** de Tauri (empaquetar un binario ayudante externo) como respaldo si un proveedor solo ofrece un SDK en otro lenguaje.
- **Pantallas/teclado/mouse/USB en general**: entrada estándar a nivel de sistema operativo, nada específico de Tauri.
- **Operación offline y recuperación**: idéntica al comportamiento web ya probado — encolar-y-reproducir, el servidor sigue siendo la única autoridad sobre inventario/dinero, el estado `CONFLICT` muestra los rechazos de negocio para corrección manual.
- **Actualizaciones**: el updater firmado de Tauri, `latest.json` auto-hospedado, sin downtime forzado.

A señalar honestamente: no apareció en la investigación ningún POS de producción verificado y con nombre construido con Tauri — este es un riesgo de referencia legítimo (no un bloqueo técnico) que amerita un piloto pequeño y deliberado (una tienda, un modelo de impresora) antes de un lanzamiento más amplio.

## 18. Sincronización en tiempo real

**Ya está implementada, ya responde la pregunta de esta sección.** Un usuario en Mobile que edita un producto hoy ya dispara `emitAccountEvent(accountId, "products")`, que llega a cada otro socket conectado en la sala de esa cuenta; una pestaña de Desktop abierta en la lista de Productos ya está cableada (vía `useDataInvalidation.js`) para refrescar ante ese evento. Extender esto a Desktop (Tauri, manteniendo Socket.IO en su transporte de navegador por defecto según §6) y a Mobile (`socket.io-client` en React Native — funciona con el transporte WebSocket estándar, necesita verificación contra el uso exacto de Ohnix pero no se encontró bloqueo estructural) no requiere **ningún cambio de backend** — las mismas salas, el mismo evento `data:changed` sin payload, el mismo modelo de "tu lista puede estar desactualizada, refresca" ya validado en producción. Esto deliberadamente no es un stream de payload empujado/CRDT (la propia auditoría del equipo del 2026-08-20 eligió invalidar-y-refrescar específicamente para evitar mantener la forma de un payload empujado sincronizada con la de la respuesta REST) — ese razonamiento se sostiene idéntico entre tres clientes, no solo dos.

Dónde esto compone con offline: un cliente que está offline en ese momento simplemente no recibirá el evento de socket (sin conexión) — al reconectar, el patrón `subscribeSyncCompleted` ya existente ya maneja "refrescar cuando se conoce el estado real", así que tampoco se necesita un mecanismo nuevo ahí. El aviso de tiempo real y el motor de sincronización offline ya fueron diseñados para no correr una carrera entre sí (§4.4 de `OFFLINE_ARCHITECTURE.md`) — esa disciplina se extiende sin cambios.

## 19. Autenticación

- **Web**: sin cambios — mecanismo dual cookie + bearer como hoy.
- **Desktop (webview de Tauri)**: puede mantener exactamente el mismo patrón cookie+bearer que usa la app web hoy (el webview de Tauri soporta cookies), lo cual es la opción más simple y no requiere bifurcar el código de auth; guardar el token bearer vía un mecanismo respaldado por el keychain del sistema operativo (ej. un comando Rust respaldado por `keyring`/Stronghold) en lugar de `localStorage` del webview es un paso de endurecimiento que vale la pena dado el diferente modelo de amenaza de robo físico de una máquina de escritorio (ver §20), pero no es un requisito funcional para lanzar.
- **Mobile (React Native)**: solo-bearer vía `expo-secure-store` (Keychain/Keystore) — RN no tiene un cookie jar compartido, así que la mitad de cookie del patrón web actual simplemente no aplica. Esto es una **simplificación**, no complejidad nueva, condicionado a confirmar que el backend ya acepta peticiones solo-bearer (verificar antes de confiar en ello).
- **Scope de empresa/sucursal/rol**: sin cambios en ningún lado — el servidor sigue siendo la única autoridad (`requireModulePermission`, `pos.permissions.js`); la verificación local tipo `hasPermission` de cada plataforma sigue siendo una conveniencia de UX que refleja lo que el servidor ya impone, exactamente como está documentado hoy para la app web.
- **Validez de la sesión offline**: el vacío conocido y previamente diferido (una sesión que expira estando offline fuerza la pantalla de login aunque siga siendo válida) se vuelve **más** urgente con una app móvil que rutinariamente se cierra por días — se lleva como ítem prioritario en lugar de "sería bueno tenerlo" (ver §26 roadmap, §29 preguntas abiertas).
- **El modelo de una sola sesión por usuario es el único punto donde este documento no está de acuerdo con lanzar Desktop+Mobile sin cambios** — ver §29.

## 20. Seguridad

| Plataforma | Almacenamiento del token | Justificación |
|---|---|---|
| Web | `localStorage` (como hoy) | Sin cambios; un tradeoff conocido y aceptado ya en producción. |
| Desktop | Almacenamiento del webview hoy; almacenamiento respaldado por el keychain del sistema operativo como paso de endurecimiento | Una máquina de escritorio (especialmente una terminal compartida de tienda) tiene un modelo de amenaza de acceso físico diferente al de un celular personal — vale el paso extra, no bloquea el lanzamiento. |
| Mobile | `expo-secure-store` (Keychain/Keystore) | Respaldado por hardware; `AsyncStorage` nunca debe guardar un token (texto plano, extraíble sin root). |
| Datos offline (todas las plataformas) | Espejo local con scope y limpieza por cuenta al cambiar de sesión/logout, como ya está implementado para web | Extender sin cambios el patrón existente `resetOfflineDataIfAccountChanged`/`clearOfflineDataOnLogout` a los adaptadores de almacenamiento nuevos — esto es trabajo de interfaz de adaptador, no diseño de seguridad nuevo. Ningún dato de tarjeta se captura ni se guarda localmente en ninguna plataforma jamás, sin cambios respecto a hoy. |

Nada aquí propone una arquitectura de seguridad nueva — es el diseño web existente (asumir el riesgo explícitamente, dar scope y limpiar los datos locales por cuenta, nunca persistir más que la superficie de lectura ya autorizada) aplicado a través de la misma interfaz de adaptador a dos motores de almacenamiento más.

## 21. Versionamiento

Tres precedentes concretos se combinan en un solo enfoque recomendado, en lugar de inventar uno desde cero:

1. **Versiones de API fijadas y solo-aditivas al estilo Stripe**: un identificador de versión asignado por cuenta/cliente, cambiable solo explícitamente (nunca actualizado silenciosamente del lado del servidor); el consumidor `packages/api-client` puede llevar esto como un header, con el servidor manteniendo una capa de transformación de compatibilidad para clientes fijados a versiones antiguas en lugar de ramificar la lógica de negocio por versión.
2. **La compuerta de versión mínima soportada de cliente de Plane** (un precedente real y publicado que calza de cerca con la forma de Ohnix — una app móvil a través de múltiples contextos de despliegue): el cliente reporta su versión al conectarse; el servidor impone un piso duro (por debajo, se bloquea por completo con un aviso explícito de actualizar) y, por encima del piso, funcionalidades individuales pueden declarar su propio requisito de versión mínima en un registro central en lugar de verificaciones ad hoc dispersas.
3. **Disciplina de lector tolerante + cambio en paralelo** (la respuesta estándar de ingeniería móvil a "la app no se abrió en tres semanas y el servidor cambió"): el binario móvil es el único componente que no se puede revertir una vez desplegado, así que toda evolución del backend debe ser solo-aditiva por defecto, y cualquier cambio de protocolo de sincronización genuinamente disruptivo debe servirse en paralelo (forma vieja y nueva simultáneamente) hasta que la telemetría muestre que ningún cliente sigue pidiendo la vieja. Los payloads de `sync-core` de Ohnix deberían construirse para ignorar silenciosamente campos no reconocidos desde el día uno, no agregarlo después como un parche.

En concreto para Ohnix: agregar un header de versión de cliente a `api-client`, un middleware ligero de compuerta de versión en el backend (426 Upgrade Required por debajo de un piso configurado por plataforma), y tratar cualquier cambio al formato de red del outbox/espejo como una migración de cambio en paralelo, nunca un corte abrupto.

## 22. Actualizaciones

- **Web**: sin cambios, deploy en Vercel con cada push.
- **Desktop**: el plugin updater firmado de Tauri, `latest.json` en GitHub Releases o S3 (gratis), verificado al iniciar; sin revisión de tienda en el proceso en absoluto.
- **Mobile**: EAS Update para cambios de solo JS/assets (rápido, sin revisión), reenvío completo de binario vía App Store/Play Store para cualquier cambio nativo — presupuestar el tiempo de revisión que se ha alargado de forma medible en 2026 (comúnmente 2-5 días para envíos nuevos, más en picos, más un ciclo completo adicional ante cualquier rechazo) al planear fechas de lanzamiento, no tratarlo como instantáneo.
- **Resguardo de incompatibilidad cross-platform**: la compuerta de versión del §21 es lo que realmente evita que un build viejo de Desktop y un build nuevo de Mobile discrepen silenciosamente sobre el protocolo de sincronización — actualizaciones y versionamiento son un solo mecanismo, no dos.

## 23. Escalabilidad

El stack actual de Ohnix (Postgres/Neon + Prisma, Socket.IO ya detrás de un adaptador Redis para fan-out multi-instancia) no necesita cambiar de forma para agregar dos tipos de cliente más — desde el punto de vista del backend, un cliente Desktop o Mobile es solo otro consumidor de API autenticado y otra conexión de socket, la misma forma de carga que otra pestaña de navegador hoy. El único lugar donde la escala realmente cambia el cálculo: la elección deliberada de la estrategia de espejo de **refetch-y-reemplazo completo sobre incremental-por-`updatedAt`** es correcta a los volúmenes de datos actuales de pyme/SMB (cientos, no millones de filas por cuenta) y ya fue evaluada y diferida conscientemente en lugar de pasada por alto — debería reconsiderarse específicamente si/cuando el tamaño de catálogo de un cliente real haga que el refetch completo sea medible mente lento, no de forma preventiva, y no de forma diferente para Desktop/Mobile de lo que sería para Web. Nada en la propuesta de este documento (extender el motor de sincronización propio, mantener Socket.IO invalidar-y-refrescar) requiere una respuesta diferente entre 1,000 y 100,000 cuentas — el gatillo para reconsiderar es el volumen de datos por cuenta, no la cantidad de tipos de cliente.

## 24. Análisis de costos

| Ítem | Costo | Notas |
|---|---|---|
| Apple Developer Program | $99/año | Cubre App Store de iOS *y* notarización de macOS — una sola membresía, sin tarifa de notarización separada. |
| Google Play Developer | $25 pago único | Confirmado vigente. |
| Firma de código Windows | ~$10/mes (Azure Trusted Signing, recomendado) o ~$200-400+/año (certificado OV/EV tradicional, vida útil máxima de 1 año impuesta por las CA desde feb 2026) | EV ya no otorga un bypass automático de reputación de SmartScreen (eliminado en 2024) — Azure Trusted Signing es la opción pragmática para el pipeline de CI de un equipo pequeño. |
| Hospedaje de auto-actualización de Tauri | $0 | `latest.json` estático + binarios en GitHub Releases o S3; un servidor de rollout escalonado dinámico es posible después sobre el backend de Render existente a ~$0 de costo marginal, no necesario al lanzar. |
| EAS Build/Update (Expo) | $0 a la escala de lanzamiento (plan gratis: 15+15 builds/mes, OTA hasta 1,000 MAU) → $99/mes (Production) una vez que el MAU móvil cruce ~1,000 | El MAU, no el volumen de builds, es el gatillo más probable para subir de plan a la escala de Ohnix. |
| Herramientas de monorepo | $0 | pnpm + Turborepo (remote cache gratis en todos los planes desde dic 2024); Nx solo si/cuando se adopte, luego un costo por colaborador más allá del plan gratis. |
| Infraestructura de sincronización/offline | $0 (sistema propio extendido) vs. $239+/mes (RxDB Pro Plus) o infraestructura nueva de logical replication de Postgres + $49-599+/mes o carga operativa de auto-hospedaje (PowerSync) vs. $0 auto-hospedado pero soporte de RN sin resolver (ElectricSQL) | Esta es la mayor divergencia de costo recurrente en todo el documento — ver §16. |
| Sobrecosto de revisión de App/Play Store | no es un costo en dinero, es un costo de calendario | Tiempo de revisión de 2-5 días para envíos nuevos en 2026 (frente al histórico ~24-48h), un ciclo completo adicional ante rechazo — presupuestar margen en las fechas de lanzamiento. |

**Piso aproximado, primer año, huella multiplataforma mínima viable**: ~$99 (Apple) + $25 (Google, pago único) + ~$120/año (firma de Windows vía Azure Trusted Signing) + $0 (actualizaciones de Tauri, plan gratis de Expo, motor de sincronización) ≈ **$250-350 el primer año, ~$225/año en adelante** antes de cruzar el techo de MAU del plan gratis de Expo — genuinamente bajo, porque el mayor costo potencial (un producto de sincronización de terceros) es justo el ítem que este documento recomienda *no* adoptar.

## 25. Estrategia de migración

Escalonada, siguiendo la misma disciplina de "confirmar con el usuario entre etapas, no construir todo de una vez" que ya usó con éxito el trabajo offline-first — reutilizando esa convención de numeración de Etapas aquí como **Fase** para evitar colisión con las Etapas 0-5 ya completadas:

- **Fase A — Fundamento compartido, sin cambio de producto.** `pnpm-workspace.yaml`, configuración de root-directory + filter-build en Vercel/Render (verificar que los deploys no se afecten), extraer `packages/sync-core` de `outbox.js`/`syncEngine.js` existentes detrás de la interfaz de adaptador de almacenamiento (adaptador Dexie = el código existente, refactorizado a la interfaz, no reescrito). Cero cambio visible en la app web ya en producción.
- **Fase B — Capa Desktop.** Tauri envolviendo el build de React existente: configuración de CSP/rutas de assets, archivos de capability, verificar antd en WebKitGTK, confirmar que Socket.IO en su transporte por defecto funciona de punta a punta, mantener Dexie como el almacén de desktop inicialmente. Lanzar primero a usuarios internos/piloto.
- **Fase C — Piloto de hardware POS.** Una tienda real, un modelo de impresora: validar un plugin de impresora térmica/cajón de dinero (o el respaldo sidecar), confirmar el paso de lector de código de barras por HID de punta a punta, endurecer antes de un lanzamiento más amplio de desktop.
- **Fase D — App Mobile, alcance más angosto por diseño** (§12): UI nueva basada en Expo Router, adaptador `expo-sqlite` para `sync-core`, auth con `expo-secure-store`, conjunto de funcionalidades deliberadamente limitado a búsquedas rápidas/escaneo de código de barras/venta rápida/notificaciones — no paridad completa de back-office. Cliente de desarrollo EAS personalizado desde el día uno si la impresión Bluetooth está en el alcance de mobile.
- **Fase E — Endurecimiento cross-platform.** Middleware de compuerta de versión (§21), extender la invalidación en tiempo real a clientes Desktop/Mobile, resolver la pregunta de una sola sesión por usuario (§29) antes de que Desktop+Mobile estén ambos en el uso diario de un solo dueño.
- **Fase F — Reconsiderar sincronización incremental solo si el volumen de datos realmente lo exige** (§23) — no programada por defecto.

Cada Fase es entregable e reversible de forma independiente, en línea con la instrucción explícita de "sin reescritura de golpe" con la que abrió este encargo.

## 26. Arquitectura recomendada

Reformulada como el único diagrama que este documento realmente respalda (ver §12 para la versión completa con justificación) — el diagrama de referencia del encargo era acertado en dirección pero simplificaba de más la capa de base de datos local (no es una sola tecnología, es una capa de lógica compartida sobre tres adaptadores de almacenamiento) y omitía la capa de tiempo real que ya existe:

```
Neon PostgreSQL → Node/Express + Prisma (idempotencia, locks reales/transacciones Serializable)
                → Socket.IO + adaptador Redis (salas cuenta/POS, data:changed)
                        │
        ┌───────────────┼───────────────┐
     WEB (React)      DESKTOP (Tauri)   MOBILE (React Native+Expo)
     Dexie            Dexie→quizás SQLite  SQLite
        └───────────────┼───────────────┘
              packages/sync-core (compartido, interfaz de adaptador de almacenamiento)
```

## 27. Roadmap de implementación

El mismo que las Fases del §25 — deliberadamente no duplicado aquí como una segunda lista divergente; la Fase A→F **es** el roadmap.

## 28. Riesgos

- **Riesgo de referencia (Desktop/POS)**: no se encontró un POS de producción verificado construido con Tauri — el piloto de una sola tienda de la Fase C existe específicamente para eliminar este riesgo antes de un lanzamiento amplio, no para descubrirlo en producción.
- **Riesgo de integración de hardware (ambas plataformas)**: el soporte de impresora térmica/cajón de dinero descansa en plugins no oficiales de la comunidad (Tauri) o librerías Bluetooth de calidad despareja que requieren un dev-client personalizado (Expo) — hay que presupuestar tiempo real de integración y validación, no una tarea de fin de semana.
- **Riesgo de renderizado en WebKitGTK (Desktop/Linux)**: rarezas de renderizado/animación reales y documentadas — necesita su propia pasada de verificación, no solo "si funciona en Windows funciona en todos lados".
- **Riesgo del adaptador de sincronización**: extraer `sync-core` y escribir dos adaptadores de almacenamiento nuevos es acotado pero es trabajo de ingeniería real con sus propios casos borde (la semántica de migración/versionamiento de esquema de SQLite difiere de la de Dexie) — el modo de falla más probable es subestimar los casos borde del adaptador, no ninguna brecha conceptual en el enfoque.
- **Riesgo del modelo de sesión**: la aplicación actual de una sola sesión por usuario es incompatible con un dueño corriendo Desktop y Mobile a la vez a menos que se aborde — ver §29, esto necesita una decisión antes de la Fase E, no después de un ticket de soporte.
- **Riesgo de calendario de revisión de tienda**: las fechas de lanzamiento móvil necesitan margen de tiempo de revisión (2-5+ días, más en rechazo) incorporado en la planificación, no tratado como instantáneo como un deploy de Vercel.

## 29. Preguntas abiertas

1. **Una sola sesión por usuario vs. multi-dispositivo por dueño.** El backend de Ohnix hoy desconecta la sesión existente de un usuario en el momento en que inicia sesión en otro lado (`session:replaced`) — correcto para "alguien más está usando mi cuenta", incorrecto para "tengo el Desktop del POS con sesión iniciada en la tienda y mi celular en el bolsillo, ambos legítimamente soy yo". Esto necesita una decisión de producto explícita (ej. limitar la aplicación de sesión única por *clase de dispositivo* en lugar de por usuario, o introducir un concepto distinto de "dispositivos registrados") antes de que Desktop y Mobile salgan ambos a los mismos dueños reales — quedó fuera del alcance de cada agente de investigación en este documento porque es una decisión de lógica de negocio, no una comparación de tecnología, y tampoco parece haberse señalado en el trabajo offline-first previo (ese trabajo es anterior a que multi-dispositivo-por-dueño fuera un escenario real).
2. ¿El backend ya acepta peticiones solo-bearer (sin cookie), de lo cual depende la auth móvil (§8, §19)? Hay que verificarlo directamente contra el middleware de auth antes de comprometerse con ese diseño, no asumirlo.
3. ¿Debería Desktop inicialmente reutilizar exactamente el mismo build de salida de la app web envuelto por Tauri, o bifurcar un build más liviano sin los caminos de código de marketing/prompt-de-instalación-PWA que no tienen sentido dentro de una capa nativa? Es una decisión de configuración de build, no de arquitectura — diferida a la Fase B.
4. ¿Cuál es el objetivo real inicial de hardware Bluetooth para mobile (qué modelos de impresora, si alguno)? Esto determina si la Fase D necesita un dev-client personalizado desde el día uno o puede diferir eso por completo.
5. ¿Debería adelantarse el "snapshot de auth en Dexie para validez de sesión offline" previamente diferido (§3, §19) específicamente porque Mobile convierte "no se abrió la app en días" en un caso rutinario en lugar de un caso borde? Se recomienda que sí, pero aún no está agendado en ninguna Fase de arriba; necesita confirmarse con el usuario antes de ubicarlo.

## 30. Recomendación final

**Tauri para Desktop. React Native + Expo para Mobile. Node + Prisma + PostgreSQL/Neon se mantienen exactamente como están. Extender el motor de sincronización propio existente (outbox/idempotencia/espejo) en lugar de adoptar RxDB, PowerSync o ElectricSQL. Reutilizar la capa de tiempo real de Socket.IO ya construida sin cambios. Migrar a un monorepo de pnpm-workspace de forma incremental, agregando Turborepo cuando se lo gane y Nx solo si realmente se necesita.**

Esto está fundamentado en lo que Ohnix realmente ya es — un backend Prisma/Postgres que ya impone integridad de reglas de negocio con locks reales de base de datos y un sistema de offline/sincronización/idempotencia probado y en producción en web, más una capa de invalidación en tiempo real que este documento no tuvo que pedir que se construyera porque ya existe. Ninguno de los tres productos de sincronización de terceros fue diseñado para un sistema cuyo requisito real es "el servidor siempre tiene la razón sobre inventario y dinero" — el sistema propio de Ohnix sí fue construido exactamente para eso, y extenderlo a dos adaptadores de almacenamiento nuevos es menos riesgo, menos costo recurrente, y menos infraestructura de producción nueva que adoptar cualquier alternativa. El único vacío genuino que esta investigación sacó a la luz que el trabajo offline-first previo no tuvo que considerar — una sola sesión por usuario chocando con un dueño usando legítimamente Desktop y Mobile a la vez — es una decisión de producto, no una elección de tecnología, y debería resolverse antes de que ambas plataformas lleguen a los mismos usuarios reales.
