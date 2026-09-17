# Productos y variantes

## Modelo de producto

Un producto en Ohnix incluye, entre otros campos: `product_name`, `product_code`, `sku`, `barcode`, `brand`, `status` (`draft`/`active`/`archived`), `buying_price`, `selling_price`, `stock`, `images[]` (galería con orden y principal), características físicas (peso/dimensiones) y variantes.

## Endpoints

| Método | Ruta | Scope |
|---|---|---|
| GET | `/products` | `products:read` |
| POST | `/products` | `products:write` |
| GET | `/products/{id}` | `products:read` |
| PATCH | `/products/{id}` | `products:write` |
| GET | `/products/{id}/variants` | `variants:read` |
| POST | `/products/{id}/variants` | `variants:write` |
| PATCH | `/variants/{variantId}` | `variants:write` |
| DELETE | `/variants/{variantId}` | `variants:write` |
| POST | `/variants/{variantId}/adjust-stock` | `inventory:write` |
| POST | `/products/{id}/images` (multipart, campo `images`, hasta 10) | `products:write` |
| PATCH | `/products/{id}/images/reorder` | `products:write` |
| DELETE | `/products/{id}/images/{imageId}` | `products:write` |
| PATCH | `/products/{id}/images/{imageId}/primary` | `products:write` |

## Obtener productos

```
GET /api/v1/public/products
```

```json
{
  "data": [
    {
      "_id": "cku...",
      "product_name": "Camiseta",
      "product_code": "CAM-001",
      "sku": "CAM-001",
      "barcode": null,
      "brand": "Ohnix Apparel",
      "status": "active",
      "selling_price": 50000,
      "stock": 25,
      "images": [{ "_id": "...", "url": "https://...", "position": 0, "is_primary": true }]
    }
  ]
}
```

## Crear una variante

Las variantes son combinaciones de opciones (ej. Color/Talla). Cada variante tiene su propio SKU, precio opcional (si es `null`, hereda el del producto), y su propio contador de stock.

```json
POST /api/v1/public/products/{id}/variants
{
  "sku": "CAM-001-NEG-M",
  "options": { "Color": "Negra", "Talla": "M" },
  "selling_price": 50000,
  "stock": 10
}
```

> El stock de una variante es una cifra propia de la variante (independiente por ahora de los distintos puntos de venta) — ver [inventory.md](inventory.md) para cómo se relaciona con el stock del producto y del punto de venta.

## Publicar productos con imágenes

Un desarrollador externo obtiene las imágenes ya listas para usar en su propia tienda directamente del arreglo `images[].url` de cada producto/variante — son URLs públicas servidas desde el almacenamiento de Ohnix, no requieren autenticación adicional para visualizarse.
