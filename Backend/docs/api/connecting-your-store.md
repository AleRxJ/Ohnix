# Cómo conectar mi e-commerce con Ohnix

*Guía pensada para el dueño de la tienda, no para un desarrollador — si tienes un equipo técnico, esta guía y la [documentación de API](README.md) se complementan.*

## ¿Qué necesito antes de comenzar?

- Un plan Ohnix **Escala** o **Enterprise** (las integraciones no están disponibles en planes inferiores).
- Acceso de administrador a tu tienda (Shopify, u otra plataforma en el futuro).

## ¿Qué es una integración?

Es una conexión entre Ohnix y tu tienda online. Una vez conectada, Ohnix puede:

- **Publicar tus productos de Ohnix en tu tienda** — con imágenes, precio, variantes y descripción.
- **Mantener el inventario sincronizado** — cuando alguien compra en tu tienda, Ohnix se entera y descuenta el stock; el número que ves en Ohnix es siempre el correcto.
- **Recibir los pedidos automáticamente** — cada venta de tu tienda aparece como un pedido en Ohnix, sin que tengas que digitarla a mano.

## ¿Qué información sincroniza Ohnix?

| Desde Ohnix hacia tu tienda | Desde tu tienda hacia Ohnix |
|---|---|
| Productos, variantes, imágenes, precio | Pedidos nuevos |
| Disponibilidad de inventario | Cambios de estado del pedido (ej. cancelado) |

Ohnix es siempre la fuente de verdad del **catálogo** (nombre, precio, inventario) — un cambio que hagas directamente en tu tienda (sin pasar por Ohnix) no se refleja de vuelta. Tu tienda es la fuente del **pedido en sí** una vez que ocurre la venta.

## Cómo conectar (Shopify)

1. En Ohnix, ve a **Facturación → Integraciones → Conectar tienda**.
2. En tu panel de Shopify: **Configuración → Apps y canales de venta → Desarrollar apps → Crear una app** (dale cualquier nombre, ej. "Ohnix").
3. En esa app, en **Configuración de la API de Admin**, otorga permisos de lectura y escritura sobre: `products`, `product_listings`, `inventory`, `orders`.
4. Instala la app. Shopify te mostrará un **Admin API access token** (empieza con `shpat_...`) — cópialo, solo se muestra una vez.
5. En la misma pantalla de tu app en Shopify, copia también el **API secret key** (empieza con `shpss_...` o similar) — lo necesitas para que Ohnix pueda verificar los pedidos que Shopify le envíe.
6. Vuelve a Ohnix y pega el dominio de tu tienda (`tu-tienda.myshopify.com`), el access token y el API secret key.
7. Haz clic en **Probar conexión** — Ohnix confirma que las credenciales funcionan y registra automáticamente los eventos de pedidos que necesita escuchar.

## Publicar productos

Desde la ficha de un producto en Ohnix, verás la opción de publicarlo hacia una integración conectada. Al publicarlo, Ohnix crea (o actualiza) ese producto en tu tienda con su nombre, descripción, imágenes, precio y variantes.

## Sincronizar inventario

El inventario se sincroniza automáticamente cada vez que cambia (una venta, un ajuste manual, una devolución) para cualquier producto ya publicado en el canal. También puedes forzar una sincronización manual desde el panel de Integraciones.

## Recibir pedidos

No tienes que hacer nada adicional: en cuanto la conexión está activa, cada venta nueva en tu tienda aparece como un pedido en Ohnix en segundos, con el inventario ya descontado.

## Cómo solucionar errores

Ve a **Facturación → Integraciones → Ver actividad** en la conexión correspondiente. Ahí verás cada intento de sincronización (producto publicado, inventario actualizado, pedido recibido) con su resultado — éxito o el mensaje de error exacto. Los errores más comunes son:

- **Token inválido o revocado** — vuelve a generar el access token en Shopify y actualiza la conexión.
- **Producto sin categoría/unidad válida** — revisa que el producto tenga todos los campos obligatorios de Ohnix antes de publicarlo.
- **Sin conexión a internet del lado del canal** — Ohnix reintenta automáticamente.

## Cómo desconectar

**Facturación → Integraciones → Desconectar**. Esto detiene toda sincronización futura; los productos y pedidos ya sincronizados no se eliminan ni de Ohnix ni de tu tienda.

## Preguntas frecuentes

**¿Puedo conectar más de una tienda?** Sí, puedes tener varias conexiones activas (ej. Shopify + tu propia web vía la API).

**¿Qué pasa si edito un producto directamente en Shopify?** Ohnix no se entera de ese cambio — Ohnix es la fuente de verdad del catálogo. Haz los cambios en Ohnix y vuelve a publicar.

**¿Puedo usar mi propia tienda/sistema en vez de Shopify?** Sí — usa la [API pública de Ohnix](README.md) directamente. Cualquier desarrollador puede integrar tu sistema propio sin depender de un conector predefinido.

**¿Es seguro?** El access token y el secreto de webhooks se guardan cifrados; nunca se muestran de nuevo después de guardarlos.
