# Inventario

Ohnix es la fuente central de inventario. El stock de un producto se compone de dos capas:

1. **`stock_movements`** — ledger append-only, fuente de verdad real de cada cambio.
2. **`Product.stock` / `ProductLocationStock` / `ProductVariant.stock`** — cachés de lectura rápida, siempre derivadas del ledger.

## Endpoints

| Método | Ruta | Scope | Qué hace |
|---|---|---|---|
| GET | `/inventory/{productId}` | `inventory:read` | Stock por punto de venta + total |
| GET | `/inventory/{productId}/movements` | `inventory:read` | Ledger de movimientos (últimos 200) |
| POST | `/inventory/{productId}/adjust` | `inventory:write` | Ajusta el stock del producto (requiere `delta` y `reason`) |
| POST | `/variants/{variantId}/adjust-stock` | `inventory:write` | Ajusta el stock propio de una variante |

## Consultar inventario

```
GET /api/v1/public/inventory/{productId}
```

```json
{
  "data": {
    "locations": [{ "point_of_sale_name": "Principal", "available": 25, "in_transit": 0, "total": 25 }],
    "totals": { "available": 25, "in_transit": 0, "total": 25 }
  }
}
```

## Actualizar inventario

```
POST /api/v1/public/inventory/{productId}/adjust
{ "delta": -1, "reason": "Venta en Shopify #1023" }
```

Un `delta` negativo nunca puede dejar el stock por debajo de cero — el ajuste se rechaza con `409` si no hay suficiente disponible (ver [errors.md](errors.md)).

## Idempotencia

Todo endpoint de escritura acepta un header `Idempotency-Key`. Si reenvías el mismo request con la misma clave (por un timeout, un reintento automático de tu HTTP client, etc.), Ohnix responde con el resultado del primer intento en vez de aplicar el cambio dos veces.

```
POST /api/v1/public/inventory/{productId}/adjust
Idempotency-Key: shopify-order-1023-line-1
```

## Variantes: una simplificación intencional (v1)

El stock de una `ProductVariant` es hoy una cifra **propia de la cuenta** (no partida todavía por punto de venta, a diferencia del stock del producto). Cuando un pedido de canal vende una variante, Ohnix descuenta **ambos** — el stock del producto en el punto de venta correspondiente (la disponibilidad real que ya usa el POS) y, en paralelo dentro de la misma transacción, el contador propio de la variante — para que nunca queden desincronizados ni puedan volverse negativos. Partir el stock de variante por punto de venta es un fast-follow planeado, no un límite de la arquitectura.
