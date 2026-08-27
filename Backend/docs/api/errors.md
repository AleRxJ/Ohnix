# Errores

Toda respuesta de error tiene esta forma:

```json
{
  "statusCode": 409,
  "success": false,
  "message": "Not enough stock to apply this adjustment",
  "errors": []
}
```

| Código | Significado |
|---|---|
| `400` | Request inválido (campo faltante, tipo incorrecto, valor fuera de rango) |
| `401` | API key faltante, inválida o revocada |
| `403` | La API key no tiene el scope requerido, o tu plan no incluye acceso a la API |
| `404` | El recurso no existe (o no pertenece a tu cuenta) |
| `409` | Conflicto — ej. un código/SKU duplicado, o un pedido modificado por otra request al mismo tiempo |
| `422` | La operación es válida pero no se puede completar ahora mismo — ej. stock insuficiente |
| `429` | Límite de requests por día alcanzado |
| `500` | Error interno — si es persistente, contáctanos |

## Rate limits

Cada API key tiene un límite de **1000 requests/día** en el plan Escala. El plan Enterprise no tiene límite. El contador se reinicia a la medianoche (hora del servidor). Al alcanzar el límite, todo request devuelve `429` hasta el siguiente reinicio.
