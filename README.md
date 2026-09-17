# Ohnix

<p align="center">
  <strong>Inventario, ventas y operaciones con trazabilidad total.</strong><br>
  Control, visibilidad y eficiencia para cada movimiento del negocio.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node" />
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/license-proprietary-lightgrey.svg" alt="License" />
  <img src="https://img.shields.io/badge/deployed-Vercel%20%2B%20Render-black.svg" alt="Deploy" />
</p>

<blockquote align="center">
  Ohnix centraliza inventario, compras, ventas, punto de venta, contabilidad, equipos e integraciones con e-commerce para que el negocio opere con menos fricción y más precisión.
</blockquote>

---

## Snapshot

| Dimensión | Enfoque |
|---|---|
| Inventario | Stock en tiempo real, variantes, múltiples ubicaciones y validaciones atómicas |
| Operaciones | Compras, ventas, cotizaciones, devoluciones y transferencias entre puntos de venta |
| Contabilidad | Plan de cuentas, asientos automáticos, períodos contables y retenciones |
| Equipos | Roles y permisos por integrante, presencia en vivo y bitácora de actividad |
| Integraciones | API pública v2 con llaves por alcance, webhooks y conectores de e-commerce |
| Automatización | Alertas de bajo stock, OTP, PDFs y correo transaccional |
| Seguridad | JWT, RBAC, cookies HTTP-only, rate limiting e idempotencia por operación |
| Suscripciones | Trial 14 días + 4 planes de pago con límites y features por tier |

---

## Why It Feels Different

<table>
  <tr>
    <td width="50%"><strong>Control real de stock</strong><br>Las mutaciones de inventario usan transacciones atómicas de PostgreSQL para evitar estados inconsistentes, incluso con múltiples puntos de venta.</td>
    <td width="50%"><strong>Flujos completos</strong><br>Compras, ventas, cotizaciones, retornos y transferencias se diseñaron como procesos operativos, no como CRUD aislado.</td>
  </tr>
  <tr>
    <td><strong>Contabilidad conectada</strong><br>Cada venta, compra, pago y devolución genera su propio asiento contable balanceado - no es un módulo separado que hay que reconciliar a mano.</td>
    <td><strong>Colaboración real</strong><br>Equipos con roles granulares, presencia en vivo vía Socket.IO y bitácora de actividad, no solo un usuario por cuenta.</td>
  </tr>
  <tr>
    <td><strong>Arquitectura clara</strong><br>Controllers, services, middleware y Prisma mantienen la lógica separada y fácil de extender.</td>
    <td><strong>Salida profesional</strong><br>PDF de facturas, carga masiva CSV/Excel y notificaciones por correo para cerrar el ciclo operativo.</td>
  </tr>
</table>

---

## Core Experience

- **Compras**: entrada de mercadería, cotizaciones a proveedor, retenciones, retorno parcial y planificador de pagos priorizado por vencimiento y caja disponible.
- **Ventas**: cotizaciones, creación de órdenes, deducción segura de stock, abonos parciales y generación de factura PDF.
- **Punto de venta**: múltiples ubicaciones por cuenta, transferencias de stock entre sedes y cajas con movimientos propios.
- **Productos**: catálogo con variantes, categorías, unidades, múltiples imágenes, precios y carga masiva por CSV.
- **Contabilidad**: plan de cuentas, asientos manuales y automáticos, conciliación bancaria, períodos contables con cierre/reapertura y retenciones.
- **Equipos**: roles y permisos configurables por integrante, presencia en vivo y bitácora de actividad - no solo el dueño de la cuenta.
- **Integraciones**: API pública v2 con llaves por alcance (scopes), webhooks salientes y conectores para publicar productos y sincronizar inventario con plataformas de e-commerce.
- **Reportes**: métricas de ventas, compras, stock bajo, margen, mejores clientes y comparación entre períodos.
- **Usuarios**: autenticación con verificación por OTP, roles y aislamiento por propietario.
- **Suscripciones**: trial de 14 días con acceso Negocio; upgrade a plan de pago vía Stripe o ePayco.

---

## Architecture Flow

```mermaid
flowchart TD
  A[Frontend React + Vite] --> B[Express API]
  A -. Socket.IO .-> I[Realtime: presencia de equipo]
  B --> C[Middleware: auth / RBAC / pricing / rate limit / idempotencia]
  C --> D[Controllers]
  D --> E[Services]
  E --> F[Prisma ORM]
  F --> G[(PostgreSQL)]
  E --> H[PDF / Correo / Cron / R2]
  I --> J[(Redis)]
  E -.-> K[itcycle-api-dian: facturación electrónica DIAN]
```

---

## Tech Stack

| Layer | Stack |
|---|---|
| Backend | Node.js, Express, ESM |
| Database | PostgreSQL, Prisma ORM |
| Realtime | Socket.IO + adaptador Redis (presencia de equipo, sesión única) |
| Auth | JWT, bcryptjs, OTP |
| Files | Multer, Cloudflare R2 (S3-compatible) |
| Reports | PDFKit |
| Email | Brevo (API transaccional) |
| Payments | Stripe (PSE, Card, Bizum, SEPA) + ePayco (Colombia) |
| Fiscal (CO) | itcycle-api-dian (motor propio) + FirmaPass (certificado digital) |
| Scheduling | node-cron |
| Frontend | React 18, Vite, React Router v7 |
| UI | Ant Design 5.x, Tailwind CSS 3.x |
| Charts | Recharts, @ant-design/plots |
| i18n | i18next (es/en) |
| HTTP | Axios |

---

## Subscription Plans

| Plan | Display name | Price/mo | Highlights |
|---|---|---|---|
| Trial | — | Gratis, 14 días | Acceso a nivel Negocio |
| `starter` | Emprendedor | $19 | 75 productos, 50 clientes, 1 punto de venta, operación básica |
| `growth` | Negocio | $49 | 500 productos, reportes, export CSV, alertas por correo, equipos (3 puestos), cotizaciones |
| `scale` | Escala | $99 | 2 000 productos, API pública, contabilidad, reportes avanzados, hasta 5 puntos de venta |
| `enterprise` | Enterprise | Custom | Todo ilimitado, soporte dedicado |

Cada feature (reportes, exportación, contabilidad, API, multi-sucursal, equipos) se controla por plan en `Backend/middleware/pricing.middleware.js` (`PLAN_LIMITS` / `PLAN_FEATURES`), tanto en backend como en la UI.

> **Facturación electrónica DIAN**: el motor propio (`itcycle-api-dian`, con FirmaPass para el certificado digital) está en desarrollo activo - el asistente de configuración y el flujo de certificado ya existen en la app, pero la disponibilidad general al cliente depende del estado de habilitación ante la DIAN en cada momento. No lo trates como una feature de venta ya lanzada sin confirmar el estado actual.

---

## API Overview

Base URL: `https://localhost:3001/api/v1`

```json
{
  "statusCode": 200,
  "data": {},
  "message": "Operation successful",
  "success": true
}
```

| Module | Route Prefix | Purpose |
|---|---|---|
| Auth | `/users` | Register, login, logout, OTP flows |
| Products | `/products` | Product/variant CRUD, images, CSV bulk upload |
| Categories | `/categories` | User and admin category management |
| Units | `/units` | Measurement unit catalog |
| Customers | `/customers` | Customer profiles and uploads |
| Suppliers | `/suppliers` | Supplier data and banking info |
| Purchases | `/purchases` | Purchase orders, retentions and returns |
| Purchase quotations | `/purchase-quotations` | Supplier quotation requests |
| Sales quotations | `/sales-quotations` | Customer quotes, with a public read-only link |
| Purchase support documents | `/purchase-support-documents` | DIAN "documento soporte" for non-invoicing suppliers |
| Orders | `/orders` | Sales orders and invoice generation |
| Stock transfers | `/stock-transfers` | Inventory movement between points of sale |
| Points of sale | (under `/team`) | Multi-location management |
| Reports | `/reports` | Dashboard KPIs and analytics |
| Finance | `/finance` | Cash accounts, payments, bank reconciliation, payables |
| Accounting | `/accounting` | Chart of accounts, journal entries, accounting periods |
| Electronic invoices | `/electronic-invoices` | DIAN invoice/credit-note status |
| Company | `/company`, `/companies` | Self-service and admin company/fiscal configuration |
| Teams | (under root) | Roles, members, invitations, activity log |
| Integrations | `/integrations` | E-commerce connectors (publish products, sync inventory) |
| Public API v2 | `/public` | Scoped API-key access for external integrations |
| API keys | `/api-keys` | Issue/revoke scoped API keys |
| Webhooks | `/webhooks` | Outbound webhook endpoint management |
| Scheduler | `/scheduler` | Low-stock alert control |
| Subscriptions | `/subscriptions` | Plan management, upgrade requests and payments |
| Pricing | `/pricing` | Public plan/price listing |
| Admin DIAN test matrix | `/admin/dian-test-matrix` | Habilitación test-set tracking (internal tool) |
| Docs | `/docs` | Swagger/OpenAPI reference |

---

## Payments (CO + ES)

### Supported Methods

- Colombia: `PSE`, `Card` (Stripe), plus `PSE`/`Card` via ePayco
- Spain: `Card`, `Bizum`, `SEPA Debit` (Stripe)

### Developer Mode Setup (Stripe)

1. Create a Stripe account and enable **Test mode**.
2. Configure payment methods in the Stripe Dashboard for Colombia and Spain.
3. Fill backend variables from `Backend/.env.example`:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_AMOUNT_STARTER_COP`, `STRIPE_AMOUNT_GROWTH_COP`, `STRIPE_AMOUNT_SCALE_COP`, `STRIPE_AMOUNT_ENTERPRISE_COP`
   - `STRIPE_AMOUNT_STARTER_EUR`, `STRIPE_AMOUNT_GROWTH_EUR`, `STRIPE_AMOUNT_SCALE_EUR`, `STRIPE_AMOUNT_ENTERPRISE_EUR`
   - `STRIPE_AMOUNT_STARTER_USD`, `STRIPE_AMOUNT_GROWTH_USD`, `STRIPE_AMOUNT_SCALE_USD`
4. Start webhook forwarding locally:

```bash
stripe listen --forward-to http://localhost:3001/api/v1/subscriptions/payments/webhook
```

5. Copy the generated `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

ePayco (Colombia-only alternative) uses `EPAYCO_PUBLIC_KEY`/`EPAYCO_PRIVATE_KEY`/`EPAYCO_P_KEY`/`EPAYCO_P_CUST_ID` - see `Backend/.env.example` for the full reference, including the amount-override variables.

### End-to-End Test

1. Create an upgrade request (Negocio, Escala, or Enterprise).
2. Approve it from the admin queue.
3. In Billing, choose country + payment method and click **Pay and activate now**.
4. Complete test checkout.
5. Verify: request `approved → closed`, subscription `plan → targetPlan`, payment success screen.

---

## Data Model

Prisma manages ~50 models across these areas (see `Backend/prisma/schema.prisma` for the full definitions):

| Area | Representative models |
|---|---|
| Identity & tenancy | `User`, `Company`, `Team`, `TeamMember`, `TeamRole`, `TeamRolePermission`, `TeamInvitation` |
| Catalog | `Product`, `ProductVariant`, `ProductImage`, `Category`, `Unit` |
| Inventory | `ProductLocationStock`, `StockMovement`, `StockTransfer`, `PointOfSale` |
| Purchasing | `Purchase`, `PurchaseDetail`, `PurchaseRetention`, `PurchaseQuotation`, `PurchasePayment`, `PurchaseSupportDocument` |
| Sales | `Order`, `OrderDetail`, `OrderPayment`, `SalesQuotation` |
| Finance & accounting | `CashAccount`, `CashMovement`, `BankStatementEntry`, `ChartAccount`, `JournalEntry`, `ManualJournalVoucher`, `AccountingPeriod`, `WithholdingConcept` |
| Fiscal (Colombia) | `ElectronicInvoice`, `ElectronicCreditNote`, `FirmaPassValidationAlert`, `DianTestMatrixRun` |
| Billing | `Subscription`, `PlanUpgradeRequest` |
| Integrations | `IntegrationConnection`, `ExternalReference`, `SyncLog`, `WebhookEndpoint`, `WebhookDelivery`, `ApiKey` |
| Platform | `IdempotencyKey`, `SystemSetting`, `AdminAuditLog`, `TeamActivityLog` |

---

## Getting Started

### Backend

```bash
cd Backend
npm install
npx prisma generate
npm run dev
```

Create `Backend/.env` (see `Backend/.env.example` for the full reference, including Factus/Alanube/itcycle-api-dian and ePayco):

```env
NODE_ENV=development
PORT=3000
DB_PROVIDER=postgres
DATABASE_URL=postgresql://<user>:<pass>@localhost:5432/ohnix

ACCESS_TOKEN_SECRET=<secret>
ACCESS_TOKEN_EXPIRY=1d
REFRESH_TOKEN_SECRET=<secret>
REFRESH_TOKEN_EXPIRY=7d

FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173

# Optional in dev - team live presence / single-session enforcement fail open without it
REDIS_URL=

# Required for OTP and low-stock alert emails
BREVO_API_KEY=<key>
SENDER_EMAIL=info@itcycle.co

# Optional in dev - falls back to local disk storage under Backend/public/temp
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

TIMEZONE=America/Bogota
```

### Frontend

```bash
cd Frontend
npm install
npm run dev
```

Create `Frontend/.env`:

```env
VITE_BACKEND_URL=http://localhost:3001
```

---

## Deployment

| Layer | Service |
|---|---|
| Frontend | Vercel — root: `Frontend/` |
| Backend | Render — config: `render.yaml` at repo root |
| Database | PostgreSQL on Render or Neon |
| Realtime | Redis (Render or any managed instance) — optional, degrades gracefully |
| File storage | Cloudflare R2 |

Production env vars for the backend (non-exhaustive - see `render.yaml` for the deployed list):

```env
DATABASE_URL=<postgres-connection-string>
DB_PROVIDER=postgres
FRONTEND_URL=https://ohnix.co
ALLOWED_ORIGINS=https://ohnix.co,https://www.ohnix.co,https://*.vercel.app
NODE_ENV=production
START_SCHEDULER=true
```

Production env vars for the frontend:

```env
VITE_BACKEND_URL=https://ohnix.onrender.com
```

---

## Why It Feels Fast

- Atomic stock updates via PostgreSQL transactions prevent overselling, even across multiple points of sale.
- Idempotency keys on order/payment/integration endpoints make retries repeat-safe instead of double-creating records.
- Service-layer logic keeps multi-step operations (sale + stock + accounting entry) consistent.
- Bulk upload returns partial success instead of failing everything.
- Scheduled alerts keep inventory visible without manual checks.

---

## Future Work

- Self-service update of DIAN supplier address and habilitación credentials after initial registration (currently support-mediated).
- Encryption at rest for `itcycle-api-dian`'s stored DIAN software PIN/technical key (currently plaintext, unlike the FirmaPass login key).
- Broader Redis-backed locking for high-throughput stock operations beyond the current transactional guarantees.
- General availability rollout of DIAN electronic invoicing once habilitación is confirmed in production.

---

## Contact

**GitHub**: [AleRxJ/Ohnix](https://github.com/AleRxJ/Ohnix)  
**Email**: info@itcycle.co

<p align="center">
  Made with care by <strong>Alejandro Vallejo</strong> · Ohnix v1.0.0
</p>
