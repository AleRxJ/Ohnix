# Sistema de Internacionalización (i18n)

Este proyecto utiliza `i18next` para manejar traducciones multi-idioma.

## Configuración

- **Idiomas Soportados**: Español (es), Inglés (en)
- **Archivos de Traducción**: `src/locales/{idioma}/common.json`
- **Configuración**: `src/i18n/config.js`

## Cómo Usar en Componentes

### 1. Importar el Hook

```jsx
import useI18n from '../hooks/useI18n';
// o
import { useTranslation } from 'react-i18next';
```

### 2. Usar en el Componente

```jsx
function MyComponent() {
  const { t } = useI18n();
  // o
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('common.app_name')}</h1>
      <p>{t('common.dashboard')}</p>
      <button>{t('common.save')}</button>
    </div>
  );
}
```

### 3. Selector de Idioma

Importa el componente `LanguageSwitcher` en tu layout:

```jsx
import LanguageSwitcher from './LanguageSwitcher/LanguageSwitcher';

function Layout() {
  return (
    <div>
      <LanguageSwitcher />
      {/* resto del contenido */}
    </div>
  );
}
```

## Agregar un Nuevo Idioma

### Paso 1: Crear Archivo de Traducción

Crea una carpeta en `src/locales/` con el código del idioma:

```
src/locales/fr/common.json
```

### Paso 2: Copiar Estructura

Copia la estructura de `src/locales/en/common.json` y traduce los valores:

```json
{
  "common": {
    "app_name": "Ohnix",
    "language": "Langue",
    // ... más traducciones
  }
}
```

### Paso 3: Actualizar Configuración

Edita `src/i18n/config.js` y agrega el idioma a los recursos:

```js
import frCommon from './locales/fr/common.json';

const resources = {
  es: { common: esCommon },
  en: { common: enCommon },
  fr: { common: frCommon }, // Nuevo idioma
};
```

### Paso 4: Actualizar Hook

Edita `src/hooks/useI18n.js` y agrega el idioma:

```js
availableLanguages: ['en', 'es', 'fr'],
languageNames: {
  en: 'English',
  es: 'Español',
  fr: 'Français',
},
```

## Estructura de Traducciones

Las traducciones están organizadas por secciones:

- **common**: Términos generales (app_name, logout, dashboard, etc.)
- **auth**: Autenticación (login, signup, email, password, etc.)
- **products**: Productos y catálogo
- **orders**: Pedidos y ventas
- **purchases**: Compras y proveedores
- **customers**: Clientes
- **suppliers**: Proveedores
- **categories**: Categorías
- **reports**: Reportes
- **validation**: Mensajes de validación

## Interpolación

Para valores dinámicos, usa:

```json
{
  "validation": {
    "field_required": "{{field}} is required"
  }
}
```

En el componente:

```jsx
t('validation.field_required', { field: 'Email' })
// Resultado: "Email is required"
```

## Persistencia

El idioma seleccionado se guarda automáticamente en `localStorage` y se recupera al recargar la página.

## Detección de Idioma

En cada carga, i18next primero revisa `localStorage` y luego el idioma del navegador para decidir el idioma inicial.

Mientras el usuario **no haya elegido un idioma manualmente**, además se consulta el país del visitante por IP (`src/i18n/geoLanguage.js`, servicio `ipwho.is`) para afinar ese resultado: si el país es de habla hispana, el idioma queda en español; si no, en inglés. Esta consulta es asíncrona y no bloquea la carga de la página — si el idioma detectado por país difiere del que ya se aplicó por el navegador, se corrige unos instantes después.

Esta consulta **no se repite en cada carga**: se guarda la fecha del último chequeo exitoso (`language_auto_detected_at`) y solo se vuelve a ejecutar cuando pasaron más de 30 días, o si el chequeo anterior falló (red, timeout, bloqueo del navegador). Así se cubren cambios reales de ubicación (mudanzas, viajes largos) sin pagar una consulta de red — ni un posible parpadeo de idioma — en cada visita.

Un cambio de idioma manual (vía `LanguageSwitcher`) se guarda en `localStorage` (clave `language_manual`) y desde ese momento tiene prioridad absoluta: la detección por país deja de ejecutarse para ese navegador hasta que se borre esa clave.

## Próximos Pasos

1. Actualiza todos los componentes para usar `t()` en lugar de strings hardcodeados
2. Agrega más traducciones según sea necesario
3. Considera agregar más idiomas (francés, portugués, etc.)
