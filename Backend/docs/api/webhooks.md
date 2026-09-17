# Webhooks

Ohnix puede notificar a tu sistema cuando algo cambia, en vez de que tengas que estar consultando la API constantemente.

## Registrar un endpoint

```json
POST /api/v1/public/webhooks
{ "url": "https://tu-sistema.com/ohnix/webhook", "events": ["order.created", "inventory.updated"] }
```

La respuesta incluye un `secret` — **solo se muestra una vez**. Úsalo para verificar la firma de cada entrega.

`url` debe ser `https://`. Puedes registrar hasta 10 endpoints por cuenta.

## Eventos disponibles

`GET /api/v1/public/webhooks/events`

| Evento | Cuándo se dispara |
|---|---|
| `product.created` | Se crea un producto |
| `product.updated` | Se actualiza un producto |
| `inventory.updated` | Cambia el stock de un producto (venta, ajuste, cancelación, devolución) |
| `order.created` | Se crea un pedido |
| `order.updated` | Un pedido pasa a `processing`/`completed` |
| `order.cancelled` | Se cancela un pedido |
| `order.refunded` | Se procesa una devolución |

## Payload

```json
{
  "event": "order.created",
  "event_id": "b1e2...uuid",
  "created_at": "2026-08-27T15:00:00.000Z",
  "data": { "order_id": "cku...", "invoice_no": "ABC123" }
}
```

## Verificar la firma

Cada entrega incluye estos headers:

```
X-Ohnix-Event: order.created
X-Ohnix-Event-Id: b1e2...uuid
X-Ohnix-Signature: <hex HMAC-SHA256>
```

La firma es `HMAC-SHA256(secret, cuerpo_exacto_enviado)`, en hexadecimal. Verifícala así:

```javascript
import crypto from "crypto";

function isValidOhnixWebhook(rawBody, signatureHeader, secret) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signatureHeader, "hex"));
}
```

> Verifica sobre el **cuerpo crudo** (bytes exactos recibidos), antes de que cualquier middleware lo parsee a JSON — igual que Ohnix mismo hace al recibir webhooks de Shopify.

## Reintentos y duplicados

- Un intento fallido (timeout, HTTP fuera de 2xx) se reintenta con backoff: 1 min, 5 min, 30 min, 2 h, 6 h, 24 h. Tras 6 intentos fallidos, la entrega se marca `failed` y no se reintenta más.
- `event_id` es único por endpoint — úsalo para deduplicar en tu lado si tu propio sistema procesa el mismo evento más de una vez (ej. porque reintentaste manualmente).
- Consulta el historial de entregas (éxito/error, intentos, último error) en `GET /api/v1/webhooks/{id}/deliveries` (requiere sesión de dashboard) o desde **Facturación → Integraciones**.

## Pedidos entrantes de un canal (conectores)

Esto es distinto de lo anterior: es Ohnix **recibiendo** webhooks de un canal conectado (hoy, Shopify), no enviándolos. Cuando conectas Shopify, Ohnix registra automáticamente sus propios webhooks (`orders/create`, `orders/updated`, `orders/cancelled`) apuntando de vuelta a Ohnix, verificados con el esquema de firma propio de Shopify (HMAC-SHA256 en base64, con el "API secret key" de tu app personalizada — distinto del access token).

Mapeo de estado aplicado hoy:

- Un pedido nuevo en Shopify → se crea en Ohnix (`completed` si el pago ya se registró, `cancelled` si llegó cancelado).
- Un pedido que pasa a cancelado en Shopify, y que en Ohnix está `completed` → se cancela en Ohnix (restituye inventario).
- Cualquier otra actualización (pago capturado después, fulfillment, etiquetas, ...) se registra en el log de sincronización pero **no** dispara automáticamente más transiciones de estado en Ohnix todavía — ampliar esto es un fast-follow documentado, no un olvido.
