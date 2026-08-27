# Pedidos

## Endpoints

| Método | Ruta | Scope |
|---|---|---|
| GET | `/orders` | `orders:read` |
| POST | `/orders` | `orders:write` |
| GET | `/orders/{id}/details` | `orders:read` |
| PATCH | `/orders/{id}/status` | `orders:write` |

## Crear un pedido

```json
POST /api/v1/public/orders
Idempotency-Key: my-store-order-98213
{
  "customer_id": "cku...",
  "order_status": "completed",
  "orderItems": [
    { "product_id": "cku...", "variant_id": "cku...", "quantity": 2, "unitcost": 50000 }
  ]
}
```

- `order_status: "completed"` descuenta inventario de inmediato (con validación atómica de stock disponible).
- `order_status: "pending"` (o el valor por defecto) crea el pedido sin tocar stock — útil para reflejar un "pedido recibido, pago pendiente" del canal.
- `variant_id` es opcional; si el producto no tiene variantes, omítelo.
- **Siempre envía `Idempotency-Key`** con un identificador estable de tu lado (ej. el id del pedido en tu propio sistema) — así un reintento nunca crea un pedido duplicado.

## Estados

| Estado Ohnix | Significado |
|---|---|
| `pending` | Pedido recibido, aún no confirmado |
| `processing` | Confirmado, en preparación |
| `completed` | Vendido — inventario descontado |
| `cancelled` | Cancelado — inventario restituido si estaba `completed` |
| `returned` | Devuelto — alcanzado automáticamente cuando una devolución cubre toda la cantidad vendida |

Un canal externo (ej. Shopify) tiene sus propios estados (`paid`, `fulfilled`, `refunded`, ...) que no coinciden 1:1 con los de Ohnix — cada conector los traduce a esta tabla. Ver [webhooks.md](webhooks.md#pedidos-entrantes-de-un-canal) para el mapeo exacto usado por el conector de Shopify.

## Actualizar el estado

```json
PATCH /api/v1/public/orders/{id}/status
{ "status": "cancelled" }
```

Las transiciones válidas son `pending → processing → completed → cancelled`; `cancelled` y `returned` son estados finales. Una transición inválida devuelve `400`.
