# Autenticación

La API pública se autentica con una **API key**, no con las cookies/JWT que usa la app web de Ohnix.

## 1. Crear una API key

Desde Ohnix: **Facturación → API keys → Nueva API key**. Elige los scopes que necesitas (o ninguno, para acceso completo — ver [scopes](#scopes)). La clave completa (`ohx_xxxxxxxx_...`) se muestra **una sola vez**: cópiala de inmediato, Ohnix solo guarda su hash.

Puedes tener hasta 5 API keys activas por cuenta. Solo el dueño de la cuenta puede crear/gestionar API keys (no los miembros de equipo).

## 2. Usarla en cada request

Envía la clave en uno de estos dos headers:

```
Authorization: Bearer ohx_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

o

```
X-API-Key: ohx_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Scopes

Cada API key tiene una lista de scopes (permisos granulares). Un request a un endpoint que requiere un scope que la clave no tiene devuelve `403`.

| Scope | Permite |
|---|---|
| `products:read` | Leer productos |
| `products:write` | Crear/editar productos |
| `variants:read` | Leer variantes |
| `variants:write` | Crear/editar/eliminar variantes |
| `inventory:read` | Consultar stock y movimientos |
| `inventory:write` | Ajustar stock |
| `orders:read` | Leer pedidos |
| `orders:write` | Crear pedidos, actualizar su estado |
| `customers:read` | Leer clientes |
| `customers:write` | Crear clientes |
| `webhooks:write` | Registrar/gestionar webhooks salientes |

Consulta la lista vigente en `GET /api/v1/api-keys/scopes` (requiere sesión de dashboard) — nunca la des por hecho de este documento si sospechas que puede haber cambiado.

Una clave creada sin especificar `scopes` obtiene **acceso completo** (todos los scopes). Se recomienda restringir los scopes de cada clave al mínimo que su integración necesita.

## Primer request

```bash
curl https://tu-backend.com/api/v1/public/products \
  -H "Authorization: Bearer ohx_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

```javascript
// Node.js / JavaScript
const response = await fetch("https://tu-backend.com/api/v1/public/products", {
  headers: { Authorization: `Bearer ${process.env.OHNIX_API_KEY}` },
});
const { data: products } = await response.json();
```

```python
# Python
import requests
r = requests.get(
    "https://tu-backend.com/api/v1/public/products",
    headers={"Authorization": f"Bearer {OHNIX_API_KEY}"},
)
products = r.json()["data"]
```

```php
<?php
// PHP
$ch = curl_init("https://tu-backend.com/api/v1/public/products");
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer " . $_ENV["OHNIX_API_KEY"]]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$products = json_decode(curl_exec($ch), true)["data"];
```

Toda respuesta exitosa tiene esta forma:

```json
{
  "statusCode": 200,
  "data": { /* ... */ },
  "message": "Products fetched successfully",
  "success": true
}
```
