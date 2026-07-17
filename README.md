# Ohnix — Inventory & Operations Management System

[![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
[![License](https://img.shields.io/badge/license-ISC-lightgrey.svg)]()
[![Deploy](https://img.shields.io/badge/deployed-Vercel-black.svg)](https://ohnix-by-itcycle.vercel.app)

A production-grade, multi-tenant **inventory and operations platform** built on the MERN stack. Ohnix brings control, visibility, and efficiency to every movement inside the business — from supplier purchase orders and real-time stock tracking to customer sales, invoice generation, and automated low-stock alerts — all behind a layered JWT + RBAC authentication system.

Controla tu inventario, automatiza tus ventas y aporta eficiencia a cada movimiento operativo del negocio.

---

## 🧠 Key Features

- **Atomic stock operations** — `findOneAndUpdate` with `$gte` guard prevents overselling under concurrent order creation; all stock mutations run inside MongoDB sessions with full transaction rollback on failure.
- **Explicit order & purchase state machines** — enforced transition graphs (`pending → processing → completed / cancelled`, `pending → completed → returned`) block illegal status jumps at the service layer before any DB write.
- **Service layer architecture** — `OrderService` and `PurchaseService` encapsulate all business logic (invoice generation, multi-item stock deduction, return processing) and keep controllers thin.
- **Purchase return workflow** — a dedicated return-preview endpoint calculates what is actually returnable based on current stock before committing, preventing negative inventory.
- **CSV bulk product ingestion** — parses up to 500 rows, resolves category/unit references, deduplicates within the batch and against the DB, and returns a per-row error report using HTTP 207 Multi-Status.
- **Automated low-stock scheduler** — a `node-cron` singleton emails per-user HTML reports every Monday at 09:00 (IST) with a Vercel Cron fallback; fully controllable via admin API endpoints.
- **On-the-fly PDF invoices** — `pdfkit` renders branded, itemised A4 invoices with GST breakdown, streamed directly to the response without temporary files.
- **Multi-tenant data isolation** — every resource record carries a `created_by` reference; middleware enforces that users can only read/write their own data, while admins bypass the filter.
- **OTP-based auth flows** — email verification, password reset, and password change each have independent OTP issuance + 10-minute expiry + invalidation-on-use cycles.
- **Environment-aware file uploads** — Multer switches between disk storage (local dev) and memory storage (Vercel production), feeding a unified `uploadToCloudinary` helper that handles both.

---

## 🏗️ Architecture & Design

The backend follows a **layered MVC + Service pattern**:

```
HTTP Request
    │
    ▼
Router           (routes/*.routes.js)   — maps HTTP verbs to middleware chains
    │
    ▼
Middleware       (middleware/)          — JWT verification, RBAC (isAdmin), Multer, error handler
    │
    ▼
Controller       (controllers/)        — parses request, validates inputs, delegates to service or model
    │
    ▼
Service          (services/)           — coordinates multi-step business logic within DB transactions
    │
    ▼
Model            (models/)             — Mongoose schemas with encapsulated static methods
    │
    ▼
MongoDB (Atlas)
```

Controllers that deal with complex transactional flows (orders, purchases) delegate entirely to service classes, keeping the controller layer to pure HTTP concerns. Simpler CRUD resources (categories, units, suppliers, customers) are handled inline with thin controllers that call model statics directly.

All async route handlers are wrapped in a shared `asyncHandler` utility that propagates thrown errors to the Express error middleware, which discriminates `ApiError` instances from unexpected crashes and returns structured JSON either way.

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js (ESM, `"type": "module"`) |
| **Framework** | Express 4.x |
| **Database** | MongoDB via Mongoose 8.x |
| **Authentication** | JSON Web Tokens (`jsonwebtoken`), bcryptjs |
| **File Uploads** | Multer (disk + memory), Cloudinary SDK v2 |
| **Email** | Nodemailer (Gmail SMTP) |
| **PDF Generation** | PDFKit |
| **Scheduling** | node-cron + Vercel Cron |
| **Frontend** | React 18, Vite, React Router v7 |
| **UI Library** | Ant Design 5.x, Tailwind CSS 3.x |
| **Charts** | Recharts, @ant-design/plots |
| **HTTP Client** | Axios |
| **Deployment** | Vercel (backend + frontend) |
| **Code Quality** | Prettier |

---

## 🔌 API Overview

Base URL: `https://localhost:3001/api/v1`

All endpoints return a consistent envelope:

```json
{
  "statusCode": 200,
  "data": { },
  "message": "Operation successful",
  "success": true
}
```

### Resource Groups

| Tag | Prefix | Description |
|---|---|---|
| Auth | `/users` | Register, login, logout, token refresh, OTP flows |
| Products | `/products` | CRUD + CSV bulk upload |
| Categories | `/categories` | User-scoped + admin global view |
| Units | `/units` | Measurement unit management |
| Customers | `/customers` | Customer profiles with photo upload |
| Suppliers | `/suppliers` | Supplier profiles with banking details |
| Purchases | `/purchases` | Purchase orders, status transitions, return preview |
| Orders | `/orders` | Sales orders, status machine, PDF invoice |
| Reports | `/reports` | Dashboard KPIs, stock, sales, purchases, top products, low-stock |
| Scheduler | `/scheduler` | Admin control over cron job and alert threshold |

### Authentication

Tokens are accepted from three sources (in priority order): `Authorization: Bearer <token>` header, `accessToken` cookie, `accessToken` body/query field.

| Token | TTL | Transport |
|---|---|---|
| Access | 1 day | Header / Cookie |
| Refresh | 10 days | HTTP-only Cookie |

### Status Code Contract

| Code | Meaning |
|---|---|
| 201 | Resource created |
| 207 | Partial success (bulk upload) |
| 400 | Validation failure |
| 401 | Missing / invalid token |
| 403 | Insufficient role |
| 404 | Resource not found |
| 409 | Duplicate constraint |
| 422 | Insufficient stock |
| 500 | Unhandled server error |

---

## 🗄️ Database Design

Ten Mongoose models, all with `timestamps: true`:

| Model | Key Fields | Relationships |
|---|---|---|
| `User` | `username`, `email`, `password` (bcrypt), `role`, OTP fields, `refreshToken` | root entity |
| `Category` | `category_name`, `created_by` | → User |
| `Unit` | `unit_name`, `created_by` | → User |
| `Product` | `product_code` (unique per user), `stock`, `buying_price`, `selling_price` | → Category, Unit, User |
| `Customer` | `name`, `email`, `phone`, `type`, banking fields | → User |
| `Supplier` | `name`, `shopname`, banking fields | → User |
| `Purchase` | `purchase_no` (globally unique), `purchase_status` | → Supplier, User |
| `PurchaseDetail` | `quantity`, `unitcost`, return tracking fields | → Purchase, Product |
| `Order` | `invoice_no` (globally unique, auto-generated), `order_status` | → Customer, User |
| `OrderDetail` | `quantity`, `unitcost`, `total` | → Order, Product |

**Notable design decisions:**

- `Product` uses a compound unique index `{ product_code, created_by }` so the same code can exist across different user tenants.
- `Product.deductStock` uses an atomic `findOneAndUpdate` with `{ stock: { $gte: quantity } }` as a filter — if the document doesn't match (race condition), the update returns `null` and the transaction aborts rather than silently overselling.
- Purchase returns track `returned_quantity` and `refund_amount` per `PurchaseDetail` row, enabling partial returns and audit trails.
- Category visibility merges user-owned categories with admin-created categories (de-duplicated via `Set`) to give users a shared taxonomy without compromising isolation.

---

## 📂 Project Structure

```
Backend/
├── controllers/        # Thin HTTP handlers — validate input, delegate, return response
│   ├── order.controller.js
│   ├── purchase.controller.js
│   ├── product.bulk.controller.js   # CSV ingestion logic
│   └── ...
├── services/           # Business logic, transactions, state machine enforcement
│   ├── order.service.js
│   └── purchase.service.js
├── models/             # Mongoose schemas + encapsulated static methods
│   ├── product.model.js             # deductStock / restoreStock / findInsufficientStock
│   ├── order.model.js               # getOrderWithDetails (aggregation pipeline)
│   └── ...
├── routes/             # Express Router — wires middleware chains to controllers
├── middleware/
│   ├── auth.middleware.js           # JWT verification → req.user
│   ├── admin.middleware.js          # Role guard
│   ├── multer.middleware.js         # Env-aware storage + CSV/image filters
│   └── error.middleware.js          # Centralised error serialiser
├── utils/
│   ├── ApiError.js                  # Typed error with statusCode + errors[]
│   ├── ApiResponse.js               # Consistent success envelope
│   ├── asyncHandler.js              # Async error propagation wrapper
│   ├── cloudinary.js                # Buffer + disk upload strategies
│   ├── nodemailer.js                # Gmail SMTP transporter singleton
│   └── lowStockScheduler.js        # Cron singleton with per-user email dispatch
├── db/index.js                      # Connection pooling (maxPoolSize: 10), singleton guard
├── app.js                           # Express setup, CORS whitelist, route registration
└── index.js                         # Server bootstrap, graceful shutdown (SIGTERM/SIGINT)

Frontend/
├── src/
│   ├── pages/          # Dashboard, Products, Orders, Purchases, Customers, Suppliers, Reports, …
│   ├── components/     # DashboardLayout, ProtectedRoute, ProfilePage, ErrorPage
│   ├── context/        # AuthContext (global auth state)
│   └── App.jsx         # Route tree — public, protected, dashboard nested routes
```

---

## 🧪 Engineering Highlights

**Transaction safety** — order creation, purchase completion, and purchase returns all run inside `mongoose.startSession()` / `startTransaction()` blocks. Any failure in the multi-step sequence (e.g., stock deduction for item N fails after items 0…N-1 succeeded) triggers `abortTransaction()` and re-throws, ensuring inventory never ends up in a partial state.

**State machine enforcement** — both `OrderService.updateOrderStatus` and `PurchaseService.updatePurchaseStatus` maintain an explicit adjacency map. Attempting an invalid transition (e.g., `completed → processing`) throws a 400 `ApiError` before any DB operation is attempted. This makes the state graph a first-class concern of the service layer rather than scattered conditional logic.

**Bulk upload resilience** — `bulkUploadProducts` uses `insertMany({ ordered: false })` so valid rows are inserted even when some rows fail. `BulkWriteError` is caught and dissected to surface per-document errors alongside a successful insert count, returned as HTTP 207.

**Connection pooling** — `connectDB` uses a module-level `isConnected` flag to avoid re-creating connections on Vercel's serverless function reuse, with `maxPoolSize: 10` and socket/server selection timeouts tuned for Atlas.

**Separation of concerns** — `ApiError` and `ApiResponse` classes enforce a contract at every layer boundary. Controllers never construct raw response objects; services never reference `req`/`res`. The error middleware is the single point that serialises `ApiError` instances to HTTP, meaning error shape is guaranteed consistent regardless of where in the stack the error originates.

**Graceful shutdown** — `SIGTERM` and `SIGINT` handlers stop the cron scheduler before `process.exit`, preventing orphaned cron jobs on container restarts.

**Security posture** — CORS origin whitelist rejects unknown origins (including Postman only via `!origin` pass-through for tooling), cookies are `httpOnly`, `secure` in production, and `sameSite: none` for cross-origin deployments. Refresh token rotation invalidates the old token on each use.

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 14
- MongoDB Atlas cluster (or local MongoDB)
- Cloudinary account
- Gmail account with App Password enabled

### Backend

```bash
cd Backend
npm install
```

Create a `.env` file in `Backend/`:

```env
PORT=3001
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net
NODE_ENV=development

ACCESS_TOKEN_SECRET=<secret>
ACCESS_TOKEN_EXPIRY=1d
REFRESH_TOKEN_SECRET=<secret>
REFRESH_TOKEN_EXPIRY=10d

CLOUDINARY_CLOUD_NAME=<name>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>

SENDER_EMAIL=<gmail>
SENDER_PASSWORD=<app-password>

FRONTEND_URL=http://localhost:5173
TIMEZONE=Asia/Kolkata
```

```bash
npm run dev      # nodemon
# or
npm start        # node
```

### Frontend

```bash
cd Frontend
npm install
npm run dev      # Vite dev server on :5173
```

### Deployment (Vercel)

The backend includes a `vercel.json` that routes all `/api/v1/*` traffic to `index.js` and registers a Vercel Cron to call `/api/v1/scheduler/trigger-alerts` every Monday at 09:00 UTC, serving as a serverless-compatible fallback for the in-process `node-cron` scheduler (which is disabled in production via the `NODE_ENV` guard in `index.js`).

---

## 📌 Future Improvements

- **Idempotency keys** on order/purchase creation endpoints to safely handle client retries without duplicate records.
- **Redis-backed distributed locking** as a complement to MongoDB's optimistic concurrency for high-throughput stock deduction scenarios.
- **Webhook events** on order/purchase status transitions to enable downstream integrations (ERP, accounting) without polling.
- **Audit log collection** — store every status transition and stock mutation with actor, timestamp, and before/after values for compliance and debugging.
- **Test coverage** — unit tests for state machine logic in services, integration tests for the bulk upload pipeline, and contract tests for the API response envelope.
- **Rate limiting** on auth endpoints (OTP send, login) to protect against brute-force and OTP enumeration attacks.

---

## 📞 Contact

**GitHub**: [AleRxJ/Ohnix](https://github.com/AleRxJ/Ohnix)  
**Email**: alejandrosoftware.engineering@gmail.com

---

<div align="center">
    Made with ❤️ by <strong>Alejandro Vallejo</strong> &nbsp;|&nbsp; Ohnix API v1.0.0
</div>
