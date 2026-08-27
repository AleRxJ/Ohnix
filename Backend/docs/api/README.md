# API de Ohnix — guía para desarrolladores

La API de Ohnix te permite conectar tu propia tienda, ERP o sistema a los productos, variantes, inventario, pedidos y clientes de una cuenta Ohnix. Es la misma API que usan los conectores oficiales (Shopify hoy; WooCommerce y Mercado Libre están planeados).

- **Documentación interactiva (Swagger UI):** `GET /api/v1/docs`
- **Especificación OpenAPI 3.0 (JSON):** `GET /api/v1/docs/openapi.json`
- **Base URL:** `https://<tu-backend>/api/v1/public`
- **Disponibilidad:** planes Escala y Enterprise (`apiAccess`)

## Índice

- [Autenticación](authentication.md)
- [Primer request](authentication.md#primer-request)
- [Productos y variantes](products.md)
- [Inventario](inventory.md)
- [Pedidos](orders.md)
- [Clientes](#clientes)
- [Webhooks](webhooks.md)
- [Errores](errors.md)
- [Rate limits](errors.md#rate-limits)
- [Versionamiento](#versionamiento)
- [Seguridad](#seguridad)
- [Conectar mi e-commerce (guía no técnica)](connecting-your-store.md)

## Clientes

| Método | Ruta | Scope |
|---|---|---|
| GET | `/customers` | `customers:read` |
| POST | `/customers` | `customers:write` |

```json
POST /api/v1/public/customers
{
  "name": "Ana Gómez",
  "email": "ana@example.com",
  "phone": "3001234567",
  "address": "Cra 1 # 2-3, Bogotá"
}
```

## Versionamiento

La API está versionada en la URL (`/api/v1/...`). Un cambio incompatible (romper un campo existente, eliminar un endpoint) se lanza como `/api/v2/...`, dejando `/api/v1` funcionando sin cambios durante un período de transición anunciado con anticipación. Un campo nuevo agregado a una respuesta existente NO se considera un cambio incompatible — tu integración debe ignorar campos desconocidos.

## Seguridad

- Usa siempre HTTPS.
- Nunca expongas tu API key en código de frontend/cliente — solo en tu backend.
- Cada API key tiene **scopes** (permisos) granulares — dale a cada integración solo los scopes que realmente necesita.
- Puedes revocar o regenerar una API key en cualquier momento desde **Facturación → API keys**; una clave revocada deja de funcionar de inmediato.
- Los webhooks salientes de Ohnix están firmados (ver [webhooks.md](webhooks.md)) — verifica siempre la firma antes de confiar en un payload.
- Ohnix nunca vuelve a mostrar el secreto completo de una API key ni de un webhook después de su creación — guárdalo de forma segura en ese momento.
