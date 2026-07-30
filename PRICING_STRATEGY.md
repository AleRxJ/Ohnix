# Ohnix — Estrategia de Monetización v2 (Rediseño Completo)

> **Fecha de revisión:** Julio 2026  
> **Autor:** PM Senior — Revisión estratégica completa  
> **Estado:** Estrategia aprobada para implementación

---

## Resumen Ejecutivo

La estructura anterior de planes tenía tres defectos estructurales críticos: el plan Starter era gratuito con límites suficientes para operar un negocio real sin necesidad de actualizar, no existía diferenciación funcional entre planes (solo límites cuantitativos), y no había un plan de precio intermedio entre $29 y "custom", perdiendo el segmento de mayor conversión. Este documento define un rediseño completo orientado a conversión, retención y crecimiento del LTV.

---

## 1. Diagnóstico: Problemas de la Estrategia Anterior

### 1.1 El plan Starter gratuito era demasiado generoso

| Métrica | Límite anterior (gratis) | Evaluación |
|---|---|---|
| Productos | 300 | Un negocio real puede operar indefinidamente con 300 SKUs |
| Clientes | 200 | Base de clientes funcional para pymes pequeñas |
| Proveedores | 120 | Excesivo para un plan $0 |
| Pedidos/mes | 200 | ~6-7 pedidos diarios = negocio activo que debería pagar |
| Compras/mes | 120 | Ciclo de abastecimiento robusto, no corresponde a plan gratuito |

**Consecuencia directa:** Un negocio con $30K–$80K de facturación mensual podía operar indefinidamente en el plan gratis. Zero urgencia de actualizar.

### 1.2 Cero diferenciación funcional entre planes

Los planes solo diferían en cantidades. Un usuario de Starter tenía acceso a exactamente las mismas funcionalidades que un usuario de Growth: todos los reportes (ventas, compras, stock, top productos), alertas automáticas por email, exportación CSV, carga masiva de productos, PDFs de pedidos. 

**Esto destruye el incentivo de actualizar.** Cuando el límite es lo único que diferencia dos planes, el usuario se enfoca en evadir el límite (creando una segunda cuenta, eliminando registros) en vez de actualizar.

### 1.3 Gap de precio sin capturar

Estructura anterior: $0 → $29 → "custom"

Hay un segmento enorme de negocios que pagarían $50–$120/mes pero no entran en la categoría "enterprise custom". Ese segmento quedaba desatendido o se iba.

### 1.4 El salto al plan Enterprise era demasiado abrupto

Pasar de $29 a "precio personalizado enterprise" implica un proceso de ventas, negociación y tiempo. Negocios medianos que necesitan más de lo que ofrece Growth pero no quieren el proceso enterprise simplemente abandonaban la plataforma.

### 1.5 Señalización de precio "gratis" en el hero de la landing

El CTA principal decía "Crear cuenta gratis" y "Registrarse gratis". Esto condiciona al usuario a percibir Ohnix como un producto gratuito, destruyendo el ARPU (Average Revenue Per User) desde el primer punto de contacto.

### 1.6 Totales acumulados permisivos

El plan Starter tenía 1,500 pedidos totales de por vida. A 200/mes de capacidad, esto da 7.5 meses antes de llegar al límite. Una vez cerca del límite, la presión de upgrade existía pero llegaba demasiado tarde en el ciclo de vida del cliente.

---

## 2. Estrategia Recomendada: Trial Limitado + 3 Planes Pagados

### 2.1 Análisis de opciones de entrada

**Opción A — Freemium muy restringido**  
- Pros: Reduce fricción de onboarding, base de usuarios gratuita para wordof mouth
- Contras: Atrae usuarios sin intención de pago; crea soporte burden sin retorno; para inventory SaaS B2B el freemium tiene tasa de conversión histórica del 2–5%
- Veredicto: **No recomendado** para el perfil de cliente de Ohnix (operadores de negocio, no consumidores)

**Opción B — Plan inicial de pago sin trial**  
- Pros: MRR desde el día uno; señalización de valor inmediata
- Contras: Alta fricción para negocios que no conocen el producto; tasa de rechazo alta en mercado LATAM donde la confianza previa al pago es crítica
- Veredicto: **Posible** pero subóptimo para tracción inicial

**Opción C — Trial de 14 días + 3 planes pagados (RECOMENDADO)**  
- Pros: Demuestra valor con acceso completo antes del pago; crea urgencia natural con fecha de expiración; conversión B2B del trial al pago es históricamente 15–25%; modelo utilizado por Shopify, HubSpot, Holded, Zoho
- Contras: Requiere implementar lógica de expiración; posibilidad de abuso con múltiples cuentas
- Veredicto: **Estrategia óptima para Ohnix**

### 2.2 Mecánica del Trial

- **Duración:** 14 días desde la verificación del correo (no desde el registro, para evitar pérdida por inactividad temprana)
- **Acceso:** Full access al plan Negocio (segundo tier pagado)
- **Sin tarjeta de crédito requerida** al inicio — esto aumenta el signup 30–40% según datos de industria
- **Al expirar:** La cuenta pasa a estado "trial expirado" — solo lectura, sin poder crear registros nuevos. Los datos se conservan 30 días antes de archivar.
- **Nudges de conversión:** Email automático en día 7, día 12, día 13 (urgency), día 14 (last chance), día 15 (expirado + CTA de upgrade)
- **In-app banners:** A partir del día 10, banner persistente con contador regresivo

### 2.3 Por qué esta estrategia genera mayor conversión que freemium

El cliente objetivo de Ohnix es un dueño de negocio o jefe de operaciones que ya usa Excel o un sistema legacy. No viene a "explorar gratis" — viene porque tiene un problema real. El trial de 14 días con acceso completo le permite resolver ese problema de inmediato y, al día 14, ya tiene datos de su negocio en el sistema. Migrar a otra herramienta tiene un costo de esfuerzo real. Eso crea retención poderosa.

**Holded (referente más cercano a Ohnix en LATAM/España)** usa exactamente este modelo: 14 días trial + planes pagados desde €9/mes. Tasa de conversión reportada: 18–22%.

---

## 3. Nueva Estructura de Planes

### Mapeo técnico (DB → Display)

| Nombre técnico DB | Nombre en producto (ES) | Nombre en producto (EN) |
|---|---|---|
| `starter` | Emprendedor | Starter |
| `growth` | Negocio | Business |
| `scale` | Escala | Scale *(nuevo, requiere migración de schema)* |
| `enterprise` | Enterprise | Enterprise |

---

### Plan Emprendedor — `starter` — $19/mes

**Público objetivo:** Freelancers, emprendedores unipersonales, negocios que recién formalizan su inventario. Facturación mensual estimada: <$15K USD.

**Por qué existe este plan:** Un negocio que acaba de nacer necesita controlar su stock sin complejidad. $19 es el precio de una cena de negocios — la decisión de compra es inmediata y no requiere aprobación corporativa.

**Incluido:**
- Gestión de productos (CRUD, código, precio compra/venta, stock, imagen)
- Gestión de categorías
- Gestión de unidades
- Gestión de clientes
- Gestión de proveedores
- Creación de pedidos de venta con descuento automático de stock
- Creación de compras a proveedores con actualización de stock
- PDF de pedido estándar (sin logo, template fijo)
- Dashboard básico (ventas totales, compras totales, valor de inventario, productos con bajo stock)
- Reporte de stock (listado con estado in-stock / low-stock / out-of-stock)
- Alertas de stock bajo **en app solamente** (sin email automático)
- Soporte por email (SLA 72 horas hábiles)
- Acceso desde cualquier dispositivo (web responsive)

**Bloqueado:**
- Carga masiva de productos por CSV
- Reportes de ventas (gráficas de tendencia, análisis por fecha)
- Reportes de compras (análisis por proveedor)
- Reporte de top productos
- Alertas automáticas por email
- Exportación a CSV / Excel / PDF
- PDF personalizado con logo
- API
- Roles y permisos avanzados
- Onboarding asistido

**Límites:**
| Recurso | Límite |
|---|---|
| Usuarios | 1 |
| Productos | 75 |
| Clientes | 50 |
| Proveedores | 20 |
| Categorías | 15 |
| Unidades | 10 |
| Pedidos totales (acumulado) | 600 |
| Compras totales (acumulado) | 300 |
| Pedidos por mes | 60 |
| Compras por mes | 30 |

**Calibración de límites:** 60 pedidos/mes = 2 por día. Para un emprendedor con operación real pero pequeña (tienda física pequeña, venta por WhatsApp/Instagram), es suficiente para empezar. Cuando supere este ritmo sostenidamente, ya tiene el negocio probado y hay voluntad real de pago. El límite total de 600 pedidos acumulados obliga a una decisión de upgrade en ~10 meses al ritmo máximo — suficiente para validar el producto, no tan largo que postergue indefinidamente el upgrade.

---

### Plan Negocio — `growth` — $49/mes

**Público objetivo:** Negocios establecidos con 2–5 colaboradores, operación activa con múltiples proveedores y clientes regulares. Facturación mensual estimada: $15K–$100K USD.

**Por qué existe este plan:** Un negocio que ya supera los límites del Emprendedor o que necesita analizar tendencias para tomar decisiones operativas. El salto de $19 a $49 se justifica con features de análisis y productividad que ahorran horas de trabajo manual.

**Incluido (todo lo de Emprendedor, más):**
- Carga masiva de productos por CSV (hasta 500 productos por archivo)
- Todos los reportes: ventas, compras, stock, top productos, dashboard completo
- Exportación a CSV de todos los reportes
- PDF de pedidos con logo de la empresa
- Alertas automáticas de stock bajo por email (cada lunes a las 9am, configuración automática)
- Soporte prioritario por email (SLA 24 horas hábiles)

**Bloqueado:**
- Múltiples usuarios (multi-seat) — reservado para Escala
- Reportes con filtros avanzados (rangos de fecha personalizados, comparativos)
- Exportación Excel
- PDF completamente personalizable (colores, footer, cabecera)
- Alertas de stock con umbral configurable por producto
- API
- Onboarding asistido

**Límites:**
| Recurso | Límite |
|---|---|
| Usuarios | 1 (multi-seat próximamente: 3) |
| Productos | 500 |
| Clientes | 300 |
| Proveedores | 100 |
| Categorías | 40 |
| Unidades | 25 |
| Pedidos totales (acumulado) | 10,000 |
| Compras totales (acumulado) | 5,000 |
| Pedidos por mes | 300 |
| Compras por mes | 150 |

**Calibración:** 300 pedidos/mes = 10 por día. Un negocio que procesa 10 pedidos diarios tiene operación significativa. El límite acumulado de 10,000 pedidos es generoso a propósito — en este plan, la presión de upgrade vendrá de necesitar más usuarios o más funcionalidades analíticas, no del límite de transacciones.

---

### Plan Escala — `scale` — $99/mes

**Público objetivo:** Empresas en crecimiento con 5–20 personas, equipos que necesitan roles diferenciados, operaciones de mayor volumen con necesidad de integraciones y análisis profundo. Facturación mensual estimada: $100K–$500K USD.

**Por qué existe este plan:** Este es el plan que faltaba en la estructura anterior. Cubre el segmento de "demasiado grande para Negocio, demasiado pequeño para Enterprise". El 60–70% de los clientes que antes llegaban a Growth y necesitaban más se iban porque no había opción intermedia antes de "llamar a ventas".

**Incluido (todo lo de Negocio, más):**
- Reportes con filtros avanzados (rangos de fecha, comparativos mes a mes)
- Exportación a Excel (además de CSV)
- PDF de pedidos completamente personalizable (logo, colores, datos de empresa, footer)
- Alertas de stock con umbral configurable por producto (no solo el threshold global)
- Acceso a API REST (rate limit: 1,000 requests/día)
- 1 sesión de onboarding asistido (30 min con el equipo de Ohnix)
- Soporte prioritario (SLA 12 horas hábiles)
- Roles y permisos por usuario (owner / manager / staff) — cuando se implemente
- Multi-usuario (hasta 10 usuarios) — cuando se implemente

**Bloqueado:**
- API sin restricciones de rate limit
- Integraciones personalizadas (contabilidad, e-commerce, ERP)
- Account manager dedicado
- SLA <4h
- Onboarding completo asistido
- Facturación personalizada / PO

**Límites:**
| Recurso | Límite |
|---|---|
| Usuarios | 1 (multi-seat próximamente: 10) |
| Productos | 2,000 |
| Clientes | 1,000 |
| Proveedores | 400 |
| Categorías | 80 |
| Unidades | 50 |
| Pedidos totales (acumulado) | Ilimitado |
| Compras totales (acumulado) | Ilimitado |
| Pedidos por mes | 1,000 |
| Compras por mes | 500 |
| API requests/día | 1,000 |

**Calibración:** 1,000 pedidos/mes = ~33 por día. Una operación mayorista o distribuidora de tamaño mediano. Los totales acumulados son ilimitados porque, a este precio, no queremos que el usuario sienta presión artificial — la upgrade al Enterprise vendrá de necesidades organizacionales, no de límites de transacciones.

---

### Plan Enterprise — `enterprise` — Desde $249/mes (contactar)

**Público objetivo:** Empresas con operaciones complejas, múltiples sucursales, requerimientos de integración, contratos corporativos o volúmenes que excedan los límites de Escala.

**Por qué existe este plan:** Hay negocios cuyas necesidades son únicas. Pretender que un plan estándar les sirve es perder el negocio. Enterprise es para venta consultiva y crea el ancla de precio que hace que Escala a $99 parezca razonable por contraste.

**Incluido (todo lo de Escala, más):**
- Todo ilimitado (productos, clientes, proveedores, pedidos, compras)
- Usuarios ilimitados
- API completa sin restricciones de rate limit
- Integraciones personalizadas (por evaluación: contabilidad, e-commerce, ERP, WMS)
- Onboarding completo asistido (hasta 3 sesiones)
- Account manager dedicado
- SLA <4 horas en horario comercial
- Facturación personalizada (PO, contratos, descuentos por volumen)
- Multi-sucursal (roadmap)
- SSO / SAML (roadmap)
- Acceso prioritario a nuevas funcionalidades en beta

**Proceso de venta:**
- El usuario crea una upgrade request desde la plataforma
- El equipo de Ohnix hace una llamada de discovery (30 min)
- Se presenta propuesta con precio según complejidad (desde $249/mes)
- Para casos especiales (factura, contrato, descuento): revisión manual habilitada en el flujo existente de upgrade requests (campo `requiresManualReview = true`)

---

## 4. Tabla Comparativa Completa

| | **Emprendedor** | **Negocio** | **Escala** | **Enterprise** |
|---|---|---|---|---|
| **Precio/mes** | $19 | $49 | $99 | Desde $249 |
| **Usuarios** | 1 | 1 (→3) | 1 (→10) | Ilimitados |
| **Productos** | 75 | 500 | 2,000 | Ilimitados |
| **Clientes** | 50 | 300 | 1,000 | Ilimitados |
| **Proveedores** | 20 | 100 | 400 | Ilimitados |
| **Categorías** | 15 | 40 | 80 | Ilimitadas |
| **Unidades** | 10 | 25 | 50 | Ilimitadas |
| **Pedidos/mes** | 60 | 300 | 1,000 | Ilimitados |
| **Compras/mes** | 30 | 150 | 500 | Ilimitadas |
| **Pedidos acumulados** | 600 | 10,000 | Ilimitados | Ilimitados |
| **Compras acumuladas** | 300 | 5,000 | Ilimitadas | Ilimitadas |
| **Dashboard básico** | ✅ | ✅ | ✅ | ✅ |
| **Reporte de stock** | ✅ | ✅ | ✅ | ✅ |
| **Reporte de ventas** | ❌ | ✅ | ✅ | ✅ |
| **Reporte de compras** | ❌ | ✅ | ✅ | ✅ |
| **Reporte top productos** | ❌ | ✅ | ✅ | ✅ |
| **Filtros avanzados en reportes** | ❌ | ❌ | ✅ | ✅ |
| **Alertas stock bajo (en app)** | ✅ | ✅ | ✅ | ✅ |
| **Alertas stock bajo (email auto)** | ❌ | ✅ | ✅ | ✅ |
| **Alertas umbral configurable** | ❌ | ❌ | ✅ | ✅ |
| **PDF pedidos estándar** | ✅ | ✅ | ✅ | ✅ |
| **PDF con logo** | ❌ | ✅ | ✅ | ✅ |
| **PDF personalizable** | ❌ | ❌ | ✅ | ✅ |
| **Exportación CSV** | ❌ | ✅ | ✅ | ✅ |
| **Exportación Excel** | ❌ | ❌ | ✅ | ✅ |
| **Carga masiva CSV** | ❌ | ✅ | ✅ | ✅ |
| **API REST** | ❌ | ❌ | ✅ (1K req/día) | ✅ (ilimitada) |
| **Roles y permisos** | ❌ | ❌ | ✅ | ✅ |
| **Multi-sucursal** | ❌ | ❌ | ❌ | ✅ (roadmap) |
| **Integraciones personalizadas** | ❌ | ❌ | ❌ | ✅ |
| **Onboarding asistido** | ❌ | ❌ | 1 sesión | Completo |
| **Account manager** | ❌ | ❌ | ❌ | ✅ |
| **Soporte email** | 72h | 24h | 12h | <4h SLA |
| **Branding en PDF** | ❌ | Logo | Personalizable | Personalizable |

---

## 5. Justificación de Límites

### Por qué 75 productos en Starter
75 SKUs es suficiente para validar la herramienta con un catálogo real pequeño. No es frustrante (puedes operar), pero no escala con el negocio. Una tienda de ropa puede tener 50–150 referencias. Al llegar a 70+ productos, el usuario ya está comprometido con la plataforma y la conversión al siguiente plan es natural.

### Por qué 60 pedidos/mes en Starter
2 pedidos por día es una operación muy pequeña. Si un usuario supera este límite consistentemente, ya tiene ingresos suficientes para justificar $49/mes. El límite no frustra negocios que recién empiezan, pero sí crea urgencia en cuanto la operación despega.

### Por qué 300 pedidos/mes en Negocio
10 pedidos diarios representa una tienda activa o un distribuidor pequeño-mediano. A este ritmo, los reportes de ventas y el análisis de tendencias son herramientas de decisión críticas — justificando el precio de $49 por sí solos.

### Por qué totales acumulados ilimitados en Escala
Un negocio en Escala ($99/mes) que intenta migrar a Enterprise encontrará resistencia si sus datos históricos tienen un techo. Los límites acumulados ilimitados crean un "costo de migración" positivo: toda la historia del negocio está en Ohnix, lo que disuade el churn.

### Por qué API solo desde Escala
La API implica infraestructura adicional, documentación, soporte técnico y posible uso intensivo de recursos. $99/mes es el umbral donde el ROI de mantener la API por cliente se vuelve positivo. Además, un cliente que necesita API está haciendo una apuesta técnica sobre Ohnix — eso es la señal más fuerte de retención long-term.

### Por qué reportes de ventas/compras bloqueados en Starter
Los reportes avanzados son el "aha moment" más poderoso de la plataforma. Un usuario de Starter que ve su reporte de stock y quiere saber sus ventas por tendencia enfrentará una pantalla de upgrade natural. Bloquear los reportes analíticos (no el reporte de stock básico) es el gate de upgrade más efectivo.

### Por qué la carga masiva está bloqueada en Starter
Un usuario con 75 productos no necesita carga masiva. Pero cuando tiene 200–300 productos para migrar, la necesidad de carga masiva crea la conversión natural a Negocio antes de que llegue al límite de 75.

---

## 6. Justificación de Precios

### $19/mes — Emprendedor
- Punto psicológico: menos de $20, sin coma decimal significativa
- Equivalente a 1–2 horas de trabajo de cualquier empleado
- Para un negocio con $5K-$15K/mes de facturación, $19 es menos del 0.13% de ingresos
- Referentes: Trello ($5), Notion ($10), Canva Pro ($15) — en el rango "bajo pero de pago"
- No tiene competencia directa en herramientas de inventory SaaS en LATAM a este precio con el feature set ofrecido

### $49/mes — Negocio
- Multiplica x2.6 el ARPU de Emprendedor — el salto se justifica con features tangibles (reportes, CSV, alertas email, bulk upload)
- Para un negocio con $30K–$100K/mes de facturación, $49 es menos del 0.05% de ingresos
- Referentes: Holded Básico (€9) → Holded Estándar (€29); Zoho Inventory Standard ($79); Canva Teams ($13/persona)
- Competitivo vs Alegra ($25-$60/mes), Siigo, y otros ERP ligeros de la región

### $99/mes — Escala
- El plan de mayor conversión esperada (efecto "goldilock" — ni muy barato ni muy caro)
- Para un negocio con $100K+/mes, $99 es invisiblemente pequeño
- Referentes: Shopify Basic ($39), Shopify ($105), ClickUp Business ($19/usuario), Monday Basic ($12/usuario); para operaciones con equipo, $99/cuenta es extremadamente competitivo
- El acceso a API a este precio es un diferenciador fuerte vs competencia regional

### Desde $249/mes — Enterprise
- Precio ancla: hace que $99 parezca razonable por contraste (efecto de anclaje de precio)
- El rango $249–$499+ es estándar para SaaS enterprise en LATAM con account manager dedicado
- No se compite en precio en este segmento — se compite en servicio, SLA y personalización

---

## 7. Funcionalidades Exclusivas por Plan

### Solo en Negocio y superiores
- Reportes de ventas con gráficas de tendencia
- Reporte de compras con análisis de proveedores
- Reporte de top productos
- Carga masiva por CSV
- Exportación a CSV
- PDF de pedidos con logo corporativo
- Alertas automáticas por email (bajo stock)

### Solo en Escala y superiores
- Filtros avanzados en reportes (rangos de fecha, comparativos)
- Exportación a Excel
- PDF completamente personalizable
- Alertas de stock con umbral configurable por producto
- API REST con acceso programático
- Roles y permisos diferenciados por usuario
- Onboarding asistido con el equipo

### Exclusivo Enterprise
- API sin rate limit
- Integraciones personalizadas
- Account manager dedicado
- SLA < 4 horas
- Multi-sucursal (roadmap)
- Facturación corporativa (PO, contratos)

---

## 8. Estrategia de Conversión hacia Planes Superiores

### 8.1 Gates de funcionalidad (Feature Walls)
Cuando un usuario de Starter intente acceder a un reporte de ventas, verá una pantalla de upgrade en contexto con el beneficio específico ("Descubre cuáles productos generan más ingresos → Upgrade a Negocio"). El upgrade call-to-action debe estar en el contexto exacto de la funcionalidad bloqueada — no en un menú de configuración enterrado.

### 8.2 Progreso visual de límites
El dashboard de uso (ya implementado) debe mostrar barras de progreso en rojo cuando el usuario está al 80% de cualquier límite. Incluir un mensaje: "Estás al 85% de tu límite de productos. Cuando llegues al 100%, no podrás agregar más. Actualiza a Negocio para 500 productos."

### 8.3 Trial como la mejor herramienta de conversión
El trial de 14 días con acceso a features de Negocio hace que el usuario experimente los reportes de ventas, la exportación CSV y la carga masiva. Cuando el trial expira y esas funciones desaparecen, la pérdida percibida es mucho más poderosa que cualquier argumento de venta. Esto se llama **loss aversion** y es el mecanismo más efectivo de conversión en SaaS B2B.

### 8.4 Email de approaching limit
Cuando un usuario de Starter llega al 70% de cualquier límite clave (productos, pedidos/mes), enviar un email automático de "Estás creciendo — tu plan Emprendedor ya está al 70% de capacidad". Este email no debe ser un argumento de venta — debe ser una notificación de alerta genuina. La conversión viene de la urgencia real, no del pitch.

### 8.5 Upgrade en 1 clic post-checkout Stripe
El flujo actual de upgrade_request tiene fricción manual. Priorizar el checkout autónomo por Stripe para Emprendedor → Negocio y Negocio → Escala, sin revisión manual. Reducir la fricción del upgrade en un 80% es más valioso que cualquier campaña de email.

---

## 9. Anti-stagnation: Evitar que los usuarios queden indefinidamente en el plan más barato

### 9.1 El límite acumulado como reloj de arena
Los límites acumulados de pedidos (600 en Starter, 10K en Negocio) actúan como relojes de arena. No son visibles día a día, pero crean un horizonte inevitable. Un usuario activo en Starter alcanzará 600 pedidos en 10 meses. Cuando llegue al 80%, recibirá un email de alerta. Es un gate inevitable.

### 9.2 Funcionalidades de equipo como expansión natural
Cuando el negocio contrate a su primer colaborador que necesite acceso a Ohnix, el plan unipersonal ya no será suficiente. Esto crea un upgrade path orgánico vinculado al crecimiento del negocio (no a una decisión artificial). Implementar multi-usuario como feature de Negocio (3 usuarios) y Escala (10 usuarios) activa este mecanismo.

### 9.3 Análisis de "stagnant accounts"
Identificar cuentas que llevan 60+ días en el mismo plan con uso >50% de límites y que no han hecho upgrade request. Enviar una email campaign personalizada: "Tu operación ha procesado X pedidos este mes — aquí está lo que podrías ver con reportes de ventas."

### 9.4 Annual billing discount
Ofrecer 2 meses gratis en pago anual (equivale a ~16% de descuento). Esto convierte clientes mensuales en compromisos anuales, reduciendo churn y mejorando LTV. Ejemplo: Emprendedor anual = $190/año ($15.83/mes equivalente) vs $228 mensual.

---

## 10. Estrategia LTV (Lifetime Value)

### 10.1 Métricas objetivo por tier
| Plan | MRR objetivo | LTV objetivo (24 meses) | Churn mensual esperado |
|---|---|---|---|
| Emprendedor | $19 | $228–$380 | 8–12% |
| Negocio | $49 | $588–$980 | 5–8% |
| Escala | $99 | $1,188–$1,980 | 3–5% |
| Enterprise | $249+ | $5,976+ | 1–3% |

### 10.2 Upgrade revenue como motor principal
El crecimiento del LTV en SaaS no viene de retener al cliente en el mismo plan — viene de la expansión de revenue (expansion MRR). Cada vez que un usuario de Emprendedor upgradeea a Negocio, el LTV se multiplica x2.6 de forma inmediata. Invertir en hacer el upgrade path tan fácil como el signup es la mejor inversión en LTV.

### 10.3 Annual commitment como LTV multiplier
Un usuario de Negocio mensual ($49/mes) con 12 meses de retención genera $588. El mismo usuario en plan anual ($490/año, con descuento de 2 meses) genera $490 garantizados el primer año pero reduce el churn de renovación del 8% mensual al 15% anual — neto: mayor LTV esperado.

### 10.4 Expansion features como upsell natural
Cada funcionalidad que se añade en el futuro debe ser categorizada: ¿es una mejora de plan existente, o es un upsell hacia el siguiente tier? Las funcionalidades de IA (forecasting, recomendaciones de restock), multi-sucursal, o integraciones con plataformas de e-commerce deben ser gates de tier superior, no mejoras gratuitas del plan actual.

---

## 11. Estrategia Anti-Churn

### 11.1 El mayor riesgo de churn es en los primeros 30 días
Los primeros 30 días determinan si el usuario se convierte en cliente long-term. Un usuario que no llega al "aha moment" (primer pedido completado, primer reporte generado, primera alerta de stock recibida) en los primeros 7 días tiene 4x más probabilidad de cancelar.

**Acción:** Implementar el checklist de onboarding (ya existe en el código del PaymentSuccess page) como flujo activo desde el día 1 del trial, no solo post-pago. Gamificar el progreso con barras y confetti.

### 11.2 Offboarding con friction saludable
Cuando un usuario intenta cancelar, presentar:
1. Una pantalla con el resumen de lo que perderá (datos, historial, configuración)
2. La opción de pausar el plan por 1 mes (ya implementado en el backend)
3. Una oferta de downgrade a Emprendedor si venía de Negocio
4. Un formulario breve de "¿por qué te vas?" — no como obstáculo, sino para recopilar inteligencia de producto

### 11.3 Reactivación de cuentas pausadas
Las cuentas pausadas tienen 3x más probabilidad de reactivarse que las canceladas. Mantener datos activos durante el pausa y enviar un email de reactivación a los 15 días con el mensaje "Tu inventario te está esperando — todo sigue exactamente como lo dejaste."

### 11.4 Alerta de uso bajo como indicador temprano de churn
Un usuario que pasa de 80% de uso a 20% de uso en un mes está en riesgo de churn. Detectar este patrón y enviar un email proactivo de "¿Necesitas ayuda para configurar algo?" antes de que llegue a la cancelación.

---

## 12. Roadmap de Funcionalidades Premium Futuras

Estas funcionalidades, cuando se implementen, deben asignarse estratégicamente:

| Funcionalidad | Plan sugerido | Justificación |
|---|---|---|
| Multi-usuario con roles | Negocio (3 seats), Escala (10 seats) | Feature de equipo → activa upgrade orgánico |
| Forecasting / restock automático con IA | Escala y Enterprise | Alta percepción de valor; diferencia del competidor |
| Multi-sucursal / almacenes múltiples | Enterprise | Operación compleja = precio enterprise |
| Integración Shopify / WooCommerce | Escala y Enterprise | Atrae e-commerce con ticket alto |
| Integración contabilidad (Alegra, Siigo, QuickBooks) | Escala y Enterprise | Elimina un punto de dolor crítico |
| Barcode scanning móvil | Negocio y superiores | Mejora productividad operacional |
| Cotizaciones / presupuestos (pre-pedido) | Negocio y superiores | Feature pedido frecuentemente |
| Devoluciones avanzadas con nota crédito | Escala y Enterprise | Operación compleja |
| Reportes customizables con drag-and-drop | Escala y Enterprise | Power user feature |
| White-label / branding completo | Enterprise | Alto valor percibido para revendedores |
| SSO / SAML | Enterprise | Requisito de IT corporativo |
| Notificaciones WhatsApp de bajo stock | Negocio y superiores | Alta relevancia en LATAM |
| Dashboard compartible (read-only link) | Escala y Enterprise | Feature de reporteo hacia stakeholders |
| Webhooks | Escala y Enterprise | Integración con sistemas existentes del cliente |

---

## 13. Benchmark de Patrones de Monetización SaaS

| Plataforma | Modelo | Lección aplicable a Ohnix |
|---|---|---|
| **HubSpot** | Freemium restringido + tiers por feature | El freemium de HubSpot tiene CRM básico gratuito — pero bloquea automation, sequences, analytics. Para Ohnix (B2B operacional), el trial es mejor que freemium porque el "vacío operacional" no es funcional |
| **Shopify** | 3-day trial + 3 planes pagados (sin free) | El modelo más cercano a lo recomendado. Shopify sabe que un negocio que necesita un ecommerce tiene intención de pago. Mismo perfil que Ohnix |
| **Monday.com** | Freemium 2 seats + tiers por seats y features | Monday usa seats + features combinados. Para Ohnix, agregar seats en fases es el siguiente paso natural |
| **ClickUp** | Freemium + per-seat pricing | ClickUp da demasiado gratis (error de monetización que ellos mismos han reconocido en earnings calls). No replicar |
| **Notion** | Freemium individual + pricing por equipos | Notion funciona porque el freemium tiene fricciones de colaboración — el upgrade es social. Para Ohnix, el upgrade trigger es operacional, no social |
| **Canva** | Freemium + Pro individual + Teams | Canva bloquea templates premium y brand kit. El "brand kit" de Ohnix equivale al PDF personalizable — reservado para Escala |
| **Holded** | 14-day trial + 4 planes pagados (€9-€99) | Referente más directo. Modelo probado en LATAM/España con inventario y facturación. Su tier básico (€9) convierte bien por el precio de entrada bajo |
| **Zoho Inventory** | 14-day trial + 4 planes ($79-$399/org) | Zoho cobra en $/org — no por usuario. Mismo enfoque que Ohnix. Sus límites son más generosos pero sus precios son más altos — oportunidad de diferenciación por precio |
| **Odoo** | Community (open source) + Enterprise por módulo | El modelo de módulos de Odoo es poderoso pero complejo. Para Ohnix en estadio actual, mantener bundle único por tier es correcto |
| **Trello** | Freemium + per-seat | Trello es un outlier — herramienta de productividad personal, no operacional. No es referente para Ohnix |

**Patrón común en las más exitosas:** 14-day trial con tarjeta opcional + 3 planes bien diferenciados por features + Enterprise consultivo. Es exactamente la estructura recomendada.

---

## 14. Cambios Técnicos Requeridos

### 14.1 Inmediatos (implementados en este commit)
- [x] `pricing.middleware.js`: Actualizar `PLAN_LIMITS` con nuevos límites para `starter`, `growth`, `scale`
- [x] `schema.prisma`: Agregar `scale` al enum `PlanType`

### 14.2 Próxima iteración (requieren desarrollo)
- [ ] Lógica de trial: campo `trialExpiresAt` en el modelo `Subscription`; estado `trial` en `SubscriptionStatus`
- [ ] Gate de features por plan: middleware `enforcePlanFeature` para bloquear rutas de reportes según plan
- [ ] In-app usage warnings: notificación en frontend cuando uso > 80% de cualquier límite
- [ ] Email de approaching limit: trigger automático en el scheduler cuando uso > 70%
- [ ] Checkout autónomo Stripe: completar el flujo para Starter → Negocio sin revisión manual
- [ ] Annual billing: lógica de precios anuales en Stripe con `interval: year`
- [ ] Landing page: cambiar CTA de "gratis" a "Prueba gratis 14 días"
- [ ] i18n: actualizar nombres de planes en ambos locales (ES/EN) para reflejar nueva nomenclatura

### 14.3 Migración de base de datos
```sql
-- Agregar valor al enum (seguro en PostgreSQL — no requiere recrear la tabla)
ALTER TYPE "PlanType" ADD VALUE 'scale';
```
Los usuarios existentes con plan `growth` mantienen su suscripción sin cambios. La migración es aditiva.

### 14.4 Mapeo de nombres técnicos vs display
```js
export const PLAN_DISPLAY_NAMES = {
    starter: { es: "Emprendedor", en: "Starter" },
    growth:  { es: "Negocio",     en: "Business" },
    scale:   { es: "Escala",      en: "Scale" },
    enterprise: { es: "Enterprise", en: "Enterprise" },
};

export const PLAN_PRICES_USD = {
    starter: 19,
    growth:  49,
    scale:   99,
    enterprise: null, // custom
};
```

---

## 15. Validación: Checklist de Criterios de Éxito

- [x] Ningún plan es gratuito permanente — el plan de menor precio es $19/mes
- [x] Cada plan tiene funcionalidades exclusivas (no solo límites distintos)
- [x] Existe un plan intermedio entre $49 y Enterprise para capturar el segmento de mayor conversión
- [x] Los límites del plan Starter crean urgencia de upgrade en 10 meses o antes
- [x] El salto de valor de Emprendedor a Negocio es explicable en 10 segundos
- [x] El trial de 14 días demuestra features del plan Negocio, no del Emprendedor
- [x] Los reportes avanzados son el gate principal de upgrade (ya identificado como el aha-moment más poderoso)
- [x] Enterprise tiene precio ancla visible ($249) que hace que $99 parezca razonable
- [x] Cada plan resuelve un perfil de cliente diferente con problemas diferentes
- [x] La migración técnica es aditiva (no rompe suscripciones existentes)

