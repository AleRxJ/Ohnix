# Componentes Migrados a i18n

Este archivo rastrea qué componentes han sido migrados para usar traducciones con i18next.

## ✅ Componentes Completados

### Auth Pages
- [x] **Login.jsx** - Todas las etiquetas translated (login, forgot password, don't have account, etc.)

### Pendientes

#### Auth Pages
- [ ] **Signup.jsx** - Traducir formulario de registro
- [ ] **ResetPassword.jsx** - Traducir formulario de recuperación
- [ ] **EmailVerify.jsx** - Traducir verificación de correo

#### Dashboard & Layout
- [ ] **DashboardLayout.jsx** - Navegación principal
- [ ] **Dashboard.jsx** - Títulos y widgets
- [ ] **ProfilePage.jsx** - Perfil de usuario

#### Páginas Principales
- [ ] **Products.jsx** - Tabla y botones de productos
- [ ] **Orders.jsx** - Tabla y acciones de pedidos
- [ ] **Purchase.jsx** - Tabla y acciones de compras
- [ ] **Customers.jsx** - Tabla y gestión de clientes
- [ ] **Suppliers.jsx** - Tabla y gestión de proveedores
- [ ] **Category.jsx** - Tabla y gestión de categorías
- [ ] **Reports.jsx** - Reportes y análisis

#### Componentes Comunes
- [ ] **FormItems.jsx** - Labels de formularios
- [ ] **AuthButton.jsx** - Texto del botón
- [ ] **AuthCard.jsx** - Títulos genéricos
- [ ] **DashboardHeader.jsx** - Encabezados
- [ ] **Modals** - Todos los modales de confirmación

#### Componentes de UI
- [ ] **Tables** - Headers de tablas
- [ ] **Buttons** - Textos de botones genéricos
- [ ] **Forms** - Labels y placeholders
- [ ] **Messages** - Mensajes de éxito/error

## Guía de Migración Rápida

### Para cada componente:

1. **Importa el hook:**
   ```jsx
   import useI18n from '../../hooks/useI18n';
   ```

2. **Usa el hook en el componente:**
   ```jsx
   const { t } = useI18n();
   ```

3. **Reemplaza strings hardcodeados:**
   ```jsx
   // Antes
   <button>Delete</button>
   
   // Después
   <button>{t('common.delete')}</button>
   ```

4. **Agrupa las traducciones lógicamente:**
   - Usa `common.*` para palabras genéricas
   - Usa `products.*` para secciones específicas
   - Crea nuevas secciones si es necesario

5. **Actualiza los archivos JSON:**
   - `Frontend/src/locales/es/common.json` (Español)
   - `Frontend/src/locales/en/common.json` (Inglés)

## Patrones Comunes

### Textos en Tablas
```jsx
// common.json
{
  "products": {
    "product_name": "Nombre del Producto",
    "category": "Categoría",
    "price": "Precio"
  }
}

// Componente
const columns = [
  { title: t('products.product_name'), dataIndex: 'name' },
  { title: t('products.category'), dataIndex: 'category' },
  { title: t('products.price'), dataIndex: 'price' }
];
```

### Mensajes de Error/Éxito
```jsx
// common.json
{
  "validation": {
    "required_field": "Este campo es requerido",
    "invalid_email": "Correo inválido"
  }
}

// Componente
toast.error(t('validation.required_field'));
toast.success(t('products.product_added'));
```

### Placeholder en Inputs
```jsx
<Input placeholder={t('common.search')} />
<Input placeholder={t('common.name')} />
```

## Prioridad de Migración

1. **Alta**: Componentes en dashboard principal (Dashboard, Products, Orders, Purchases)
2. **Media**: Componentes de auth y profile
3. **Baja**: Componentes de reporte y análisis

## Tips

- Mantén las claves cortas y descriptivas
- Agrupa por sección/funcionalidad
- Reutiliza claves genéricas cuando sea posible
- Verifica que no falten traducciones en ningún idioma
