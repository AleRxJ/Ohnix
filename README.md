# Ohnix

<p align="center">
  <strong>Inventario, ventas y operaciones con trazabilidad total.</strong><br>
  Control, visibilidad y eficiencia para cada movimiento del negocio.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node" />
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/license-ISC-lightgrey.svg" alt="License" />
  <img src="https://img.shields.io/badge/deployed-Vercel%20%2B%20Render-black.svg" alt="Deploy" />
</p>

<blockquote align="center">
  Ohnix centraliza inventario, compras, ventas, reportes y alertas para que el negocio opere con menos fricción y más precisión.
</blockquote>

---

## Snapshot

| Dimensión | Enfoque |
|---|---|
| Inventario | Stock en tiempo real, validaciones atómicas y control multiusuario |
| Operaciones | Compras, ventas, devoluciones y reportes en un solo flujo |
| Automatización | Alertas de bajo stock, OTP, PDFs e integración con correo |
| Seguridad | JWT, RBAC, cookies HTTP-only y aislamiento por usuario |
| Suscripciones | Trial 14 días + 4 planes de pago con límites por tier |

---

## Why It Feels Different

<table>
  <tr>
    <td width="50%"><strong>Control real de stock</strong><br>Las mutaciones de inventario usan transacciones atómicas de PostgreSQL para evitar estados inconsistentes.</td>
    <td width="50%"><strong>Flujos completos</strong><br>Compras, órdenes, retornos y alertas se diseñaron como procesos operativos, no como CRUD aislado.</td>
  </tr>
  <tr>
    <td><strong>Arquitectura clara</strong><br>Controllers, services, middleware y Prisma mantienen la lógica separada y fácil de extender.</td>
    <td><strong>Salida profesional</strong><br>PDF de facturas, carga masiva CSV y notificaciones por correo para cerrar el ciclo operativo.</td>
  </tr>
</table>

---

## Core Experience

- **Compras**: entrada de mercadería, control de estados y retorno parcial con trazabilidad.
- **Ventas**: creación de órdenes, deducción segura de stock y generación de factura PDF.
- **Productos**: catálogo con categorías, unidades, precios y carga masiva por CSV.
- **Reportes**: métricas para decisiones rápidas sobre ventas, compras y stock bajo.
- **Usuarios**: autenticación con verificación por OTP, roles y aislamiento por propietario.
- **Suscripciones**: trial de 14 días con acceso Negocio; upgrade a plan de pago vía Stripe.

---

## Architecture Flow

```mermaid
flowchart TD
  A[Frontend React + Vite] --> B[Express API]
  B --> C[Middleware: auth / RBAC / pricing / uploads]
  C --> D[Controllers]
  D --> E[Services]
  E --> F[Prisma ORM]
  F --> G[(PostgreSQL)]
  E --> H[PDF / Email / Cron]
```

---

## Tech Stack

| Layer | Stack |
|---|---|
| Backend | Node.js, Express, ESM |
| Database | PostgreSQL, Prisma ORM |
| Auth | JWT, bcryptjs, OTP |
| Files | Multer, Cloudinary |
| Reports | PDFKit |
| Email | Nodemailer (Spacemail SMTP) |
| Payments | Stripe (PSE, Card, Bizum, SEPA) |
| Scheduling | node-cron |
| Frontend | React 18, Vite, React Router v7 |
| UI | Ant Design 5.x, Tailwind CSS 3.x |
| Charts | Recharts, @ant-design/plots |
| HTTP | Axios |

---

## Subscription Plans

| Plan | Display name | Price | Highlights |
|---|---|---|---|
| Trial | — | Free 14 days | Negocio-level access during trial |
| `starter` | Emprendedor | $19/mo | 75 products, 50 customers, basic ops |
| `growth` | Negocio | $49/mo | 500 products, reports, CSV export, email alerts |
| `scale` | Escala | $99/mo | 2 000 products, API access, configurable thresholds |
| `enterprise` | Enterprise | Custom | Unlimited, dedicated support |

Feature gates (reports, CSV export, bulk upload, email alerts) are enforced per plan by `pricing.middleware.js`.

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
| Products | `/products` | Product CRUD and CSV bulk upload |
| Categories | `/categories` | User and admin category management |
| Units | `/units` | Measurement unit catalog |
| Customers | `/customers` | Customer profiles and uploads |
| Suppliers | `/suppliers` | Supplier data and banking info |
| Purchases | `/purchases` | Purchase orders and returns |
| Orders | `/orders` | Sales orders and invoice generation |
| Reports | `/reports` | Dashboard KPIs and analytics |
| Scheduler | `/scheduler` | Low-stock alert control |
| Subscriptions | `/subscriptions` | Plan management and upgrade requests |
| Company | `/company` | Company profile |

---

## Payments (CO + ES)

### Supported Methods

- Colombia: `PSE`, `Card`
- Spain: `Card`, `Bizum`, `SEPA Debit`

### Developer Mode Setup (Stripe)

1. Create a Stripe account and enable **Test mode**.
2. Configure payment methods in the Stripe Dashboard for Colombia and Spain.
3. Fill backend variables from `Backend/.env.example`:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_AMOUNT_GROWTH_COP`, `STRIPE_AMOUNT_SCALE_COP`, `STRIPE_AMOUNT_ENTERPRISE_COP`
   - `STRIPE_AMOUNT_GROWTH_EUR`, `STRIPE_AMOUNT_SCALE_EUR`, `STRIPE_AMOUNT_ENTERPRISE_EUR`
4. Start webhook forwarding locally:

```bash
stripe listen --forward-to http://localhost:3001/api/v1/subscriptions/payments/webhook
```

5. Copy the generated `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

### End-to-End Test

1. Create an upgrade request (Growth, Scale, or Enterprise).
2. Approve it from the admin queue.
3. In Billing, choose country + payment method and click **Pay and activate now**.
4. Complete test checkout.
5. Verify: request `approved → closed`, subscription `plan → targetPlan`, payment success screen.

---

## Data Model

| Model | Notes |
|---|---|
| User | Roles, OTP fields, company link |
| Subscription | Plan, status, trial window, upgrade requests |
| Category | Scoped by creator |
| Unit | Scoped by creator |
| Product | Stock, purchase and sale prices, tenant isolation |
| Customer | Contact and billing profile |
| Supplier | Commercial and banking profile |
| Purchase | Purchase number and status lifecycle |
| PurchaseDetail | Quantities, costs, and return tracking |
| Order | Invoice number and lifecycle |
| OrderDetail | Line items and totals |

---

## Getting Started

### Backend

```bash
cd Backend
npm install
npx prisma generate
npm run dev
```

Create `Backend/.env`:

```env
PORT=3001
DATABASE_URL=postgresql://<user>:<pass>@localhost:5432/ohnix
NODE_ENV=development

ACCESS_TOKEN_SECRET=<secret>
ACCESS_TOKEN_EXPIRY=1d
REFRESH_TOKEN_SECRET=<secret>
REFRESH_TOKEN_EXPIRY=10d

CLOUDINARY_CLOUD_NAME=<name>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>

SENDER_EMAIL=info@itcycle.co
SENDER_PASSWORD=<spacemail-password>

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

FRONTEND_URL=http://localhost:5173
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
| Frontend | Vercel (free tier) — root: `Frontend/` |
| Backend | Render — config: `render.yaml` at repo root |
| Database | PostgreSQL on Render or Neon |

Production env vars for the backend:

```env
DATABASE_URL=<postgres-connection-string>
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

- Atomic stock updates via PostgreSQL transactions prevent overselling.
- Service-layer logic keeps multi-step operations consistent.
- Bulk upload returns partial success instead of failing everything.
- Scheduled alerts keep inventory visible without manual checks.

---

## Future Work

- Idempotency keys for repeat-safe order creation.
- Redis locking for higher throughput stock operations.
- Audit logs for every state transition and stock mutation.
- Rate limiting on auth and OTP endpoints.

---

## Contact

**GitHub**: [AleRxJ/Ohnix](https://github.com/AleRxJ/Ohnix)  
**Email**: info@itcycle.co

<p align="center">
  Made with care by <strong>Alejandro Vallejo</strong> · Ohnix v1.0.0
</p>
