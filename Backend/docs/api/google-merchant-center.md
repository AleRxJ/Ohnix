# Google Merchant Center en la arquitectura de Ohnix

**Conclusión: es un catálogo/feed, no un canal de venta.** Google Merchant Center no procesa pagos ni genera pedidos — solo publica el catálogo (Google Shopping, anuncios de Shopping, y opcionalmente "Buy on Google" en mercados donde está disponible) a partir de un feed de productos. Cuando un comprador compra a través de él, la venta ocurre en el sitio del comerciante (o en el checkout de Google, según el modo), no dentro de Merchant Center — por eso no encaja como "conector" en el mismo sentido que Shopify (que sí crea el pedido y lo devuelve a Ohnix).

## Cómo encaja

Merchant Center consume dos cosas de Ohnix, ambas de solo lectura desde su punto de vista:

1. **Catálogo de productos** — nombre, descripción, imágenes, precio, disponibilidad, GTIN/marca (de ahí que el modelo de producto ya tenga `barcode`/`brand` — son exactamente los campos que un feed de Merchant Center exige).
2. **Inventario** — el campo `availability` del feed (`in stock` / `out of stock` / `preorder`) se deriva directamente de `Product.stock` / `ProductVariant.stock`.

No hay flujo inverso: Merchant Center nunca le devuelve pedidos ni cambios de inventario a Ohnix.

## Cómo se implementaría (no construido en esta fase)

La forma correcta de generar un feed de Merchant Center sobre esta arquitectura es un **connector de solo publicación** (`google_merchant`) dentro del mismo `connectors/registry.js`, que en vez de llamar a una API REST como Shopify, expone:

- Un feed XML (formato RSS 2.0 con namespace `g:`) o un feed programático vía la [Content API for Shopping](https://developers.google.com/shopping-content), en un endpoint que Google puede consultar periódicamente (feed "programado"), reusando exactamente los mismos datos que ya expone `mapProduct`/`ExternalReference` para cualquier otro conector.
- Ningún webhook entrante — a diferencia de Shopify, no hay nada que Ohnix deba recibir de vuelta.

Queda fuera de esta fase (Fase 7 del plan de priorización) porque el patrón de "conector de solo lectura hacia un feed", aunque distinto al patrón "conector con pedidos" de Shopify, ya es representable sin cambios en el núcleo — es exactamente el tipo de extensión que la arquitectura de conectores existe para soportar sin tocar el resto de Ohnix.
