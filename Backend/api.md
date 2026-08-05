# 📦 Ohnix by iTCycle API Documentation

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)

A comprehensive **Inventory Management System** built with the MERN stack, featuring JWT authentication, role-based access control (RBAC), automated stock alerts, and complete order/purchase management.

---

## 🌐 Base URL

```
https://localhost:3001/api/v1
```

---

## 📚 Table of Contents

- [🔐 Authentication APIs](#-authentication-apis)
- [📂 Category APIs](#-category-apis)
- [👥 Customer APIs](#-customer-apis)
- [🏭 Supplier APIs](#-supplier-apis)
- [📏 Unit APIs](#-unit-apis)
- [📦 Product APIs](#-product-apis)
- [🛒 Purchase APIs](#-purchase-apis)
- [🛍️ Order APIs](#️-order-apis)
- [📊 Report APIs](#-report-apis)
- [⏰ Scheduler APIs](#-scheduler-apis)
- [💳 Subscription APIs](#-subscription-apis)
- [🏢 Company APIs](#-company-apis)
- [🔒 Authentication & Authorization](#-authentication--authorization)
- [📋 Response Structure](#-response-structure)

---

## 🔐 Authentication APIs

Comprehensive user authentication and account management.

| Method    | Endpoint                            | Description                            | Auth | Role   |
| --------- | ----------------------------------- | -------------------------------------- | ---- | ------ |
| **POST**  | `/users/register`                   | Register a new user account            | ❌   | Public |
| **POST**  | `/users/login`                      | Login with email and password          | ❌   | Public |
| **POST**  | `/users/logout`                     | Logout current user session            | ✅   | User   |
| **POST**  | `/users/refresh-token`              | Refresh expired access token           | ❌   | Public |
| **GET**   | `/users/current-user`               | Get current authenticated user details | ✅   | User   |
| **PATCH** | `/users/update-account`             | Update account information             | ✅   | User   |
| **PATCH** | `/users/avatar`                     | Update user profile avatar             | ✅   | User   |
| **POST**  | `/users/change-password`            | Change current user password           | ✅   | User   |
| **POST**  | `/users/send-verify-otp`            | Send OTP for email verification        | ✅   | User   |
| **POST**  | `/users/verify-email`               | Verify email with OTP code             | ✅   | User   |
| **POST**  | `/users/is-auth`                    | Check if user is authenticated         | ✅   | User   |
| **POST**  | `/users/send-reset-otp`             | Send OTP for password reset            | ❌   | Public |
| **POST**  | `/users/reset-password`             | Reset password using OTP               | ❌   | Public |
| **POST**  | `/users/send-change-password-otp`   | Send OTP for password change           | ✅   | User   |
| **POST**  | `/users/verify-change-password-otp` | Verify password change OTP             | ✅   | User   |
| **GET**   | `/users/admin/users`                | List all users across companies        | ✅   | Admin  |
| **POST**  | `/users/admin/users`                | Create managed user                    | ✅   | Admin  |
| **PATCH** | `/users/admin/users/:userId`        | Update managed user role/company/state | ✅   | Admin  |
 
Optional field:
- `desiredPlan`: `growth` or `enterprise` to automatically create an open upgrade request after signup (account is still created on Starter).
- `preferredLanguage`: `es` or `en` to persist communication language for account and billing notifications.

`/users/update-account` supports:
- `username` (optional)
- `preferredLanguage` (`es` or `en`, optional)

---

## 📂 Category APIs

Product category management with user isolation and admin override.

| Method     | Endpoint                | Description                                  | Auth | Role  |
| ---------- | ----------------------- | -------------------------------------------- | ---- | ----- |
| **POST**   | `/categories`           | Create a new product category                | ✅   | User  |
| **GET**    | `/categories/user`      | Get all categories created by logged-in user | ✅   | User  |
| **PATCH**  | `/categories/user/:id`  | Update own category by ID                    | ✅   | User  |
| **DELETE** | `/categories/user/:id`  | Delete own category by ID                    | ✅   | User  |
| **GET**    | `/categories/admin/all` | Get all categories from all users            | ✅   | Admin |
| **PATCH**  | `/categories/admin/:id` | Update any category by ID                    | ✅   | Admin |
| **DELETE** | `/categories/admin/:id` | Delete any category by ID                    | ✅   | Admin |

---

## 👥 Customer APIs

Customer relationship management with user-specific data access.

| Method     | Endpoint         | Description                                 | Auth | Role  |
| ---------- | ---------------- | ------------------------------------------- | ---- | ----- |
| **POST**   | `/customers`     | Create a new customer profile               | ✅   | User  |
| **GET**    | `/customers`     | Get all customers created by logged-in user | ✅   | User  |
| **PATCH**  | `/customers/:id` | Update customer information by ID           | ✅   | User  |
| **DELETE** | `/customers/:id` | Delete customer by ID                       | ✅   | User  |
| **GET**    | `/customers/all` | Get all customers across all users          | ✅   | Admin |

---

## 🏭 Supplier APIs

Supplier management with banking and contact details.

| Method     | Endpoint               | Description                                 | Auth | Role  |
| ---------- | ---------------------- | ------------------------------------------- | ---- | ----- |
| **POST**   | `/suppliers`           | Create a new supplier profile               | ✅   | User  |
| **GET**    | `/suppliers`           | Get all suppliers created by logged-in user | ✅   | User  |
| **PATCH**  | `/suppliers/:id`       | Update supplier information by ID           | ✅   | User  |
| **DELETE** | `/suppliers/:id`       | Delete supplier by ID                       | ✅   | User  |
| **GET**    | `/suppliers/admin/all` | Get all suppliers across all users          | ✅   | Admin |

---

## 📏 Unit APIs

Measurement unit management for product inventory.

| Method     | Endpoint           | Description                             | Auth | Role  |
| ---------- | ------------------ | --------------------------------------- | ---- | ----- |
| **POST**   | `/units`           | Create a new measurement unit           | ✅   | User  |
| **GET**    | `/units`           | Get all units created by logged-in user | ✅   | User  |
| **PATCH**  | `/units/:id`       | Update unit information by ID           | ✅   | User  |
| **DELETE** | `/units/:id`       | Delete unit by ID                       | ✅   | User  |
| **GET**    | `/units/admin/all` | Get all units across all users          | ✅   | Admin |

---

## 📦 Product APIs

Complete product inventory management with stock tracking.

| Method     | Endpoint        | Description                                | Auth | Role  |
| ---------- | --------------- | ------------------------------------------ | ---- | ----- |
| **POST**   | `/products`     | Create a new product with details          | ✅   | User  |
| **GET**    | `/products`     | Get all products created by logged-in user | ✅   | User  |
| **PATCH**  | `/products/:id` | Update product information by ID           | ✅   | User  |
| **DELETE** | `/products/:id` | Delete product by ID                       | ✅   | User  |
| **GET**    | `/products/all` | Get all products across all users          | ✅   | Admin |

---

## 🛒 Purchase APIs

Purchase order management with return processing and stock updates.

| Method    | Endpoint                        | Description                                         | Auth | Role  |
| --------- | ------------------------------- | --------------------------------------------------- | ---- | ----- |
| **POST**  | `/purchases`                    | Create a new purchase order                         | ✅   | User  |
| **GET**   | `/purchases`                    | Get all purchase orders                             | ✅   | User  |
| **GET**   | `/purchases/:id`                | Get detailed purchase information by ID             | ✅   | User  |
| **PATCH** | `/purchases/:id`                | Update purchase status (pending/completed/returned) | ✅   | User  |
| **GET**   | `/purchases/:id/return-preview` | Preview return details before processing            | ✅   | User  |
| **GET**   | `/purchases/all`                | Get all purchases across all users                  | ✅   | Admin |

---

## 🛍️ Order APIs

Sales order management with invoice generation and status tracking.

| Method    | Endpoint              | Description                                                  | Auth | Role  |
| --------- | --------------------- | ------------------------------------------------------------ | ---- | ----- |
| **POST**  | `/orders`             | Create a new sales order                                     | ✅   | User  |
| **GET**   | `/orders`             | Get all orders created by logged-in user                     | ✅   | User  |
| **GET**   | `/orders/:id/details` | Get complete order details with items                        | ✅   | User  |
| **PATCH** | `/orders/:id/status`  | Update order status (pending/processing/completed/cancelled) | ✅   | User  |
| **GET**   | `/orders/:id/invoice` | Generate and download order invoice                          | ✅   | User  |
| **GET**   | `/orders/:id/electronic-invoice` | Get electronic invoicing status for the order (Factus, CO only) | ✅ | User |
| **POST**  | `/orders/:id/electronic-invoice/issue` | Send order to Factus for DIAN electronic invoicing (CO only) | ✅ | User |
| **POST**  | `/orders/:id/electronic-invoice/sync` | Re-fetch the invoice status from Factus (`issuing`/`submitted` only) | ✅ | User |
| **POST**  | `/orders/:id/electronic-invoice/credit-notes` | Issue a credit note against an `accepted` invoice | ✅ | User |
| **GET**   | `/orders/:id/electronic-invoice/credit-notes` | List credit notes issued for the order's invoice | ✅ | User |
| **GET**   | `/orders/all`         | Get all orders across all users                              | ✅   | Admin |

---

## 📊 Report APIs

Analytics and reporting endpoints for business insights.

| Method  | Endpoint                    | Description                                   | Auth | Role |
| ------- | --------------------------- | --------------------------------------------- | ---- | ---- |
| **GET** | `/reports/dashboard`        | Get comprehensive dashboard metrics and KPIs  | ✅   | User |
| **GET** | `/reports/stock`            | Get current stock levels and inventory status | ✅   | User |
| **GET** | `/reports/sales`            | Get sales analytics and revenue reports       | ✅   | User |
| **GET** | `/reports/purchases`        | Get purchase history and spending reports     | ✅   | User |
| **GET** | `/reports/top-products`     | Get top-selling products by revenue/quantity  | ✅   | User |
| **GET** | `/reports/low-stock-alerts` | Get products below minimum stock threshold    | ✅   | User |

---

## ⏰ Scheduler APIs

Automated task management and low stock alert system (Admin only).

| Method   | Endpoint                    | Description                                    | Auth | Role  |
| -------- | --------------------------- | ---------------------------------------------- | ---- | ----- |
| **GET**  | `/scheduler/status`         | Get current scheduler status and configuration | ✅   | Admin |
| **POST** | `/scheduler/trigger-alerts` | Manually trigger low stock alert emails        | ✅   | Admin |
| **PUT**  | `/scheduler/threshold`      | Update low stock threshold value               | ✅   | Admin |
| **POST** | `/scheduler/start`          | Start the automated scheduler service          | ✅   | Admin |
| **POST** | `/scheduler/stop`           | Stop the automated scheduler service           | ✅   | Admin |

---

## 💳 Subscription APIs

Subscription lifecycle and plan usage tracking.

| Method    | Endpoint                             | Description                                            | Auth | Role  |
| --------- | ------------------------------------ | ------------------------------------------------------ | ---- | ----- |
| **GET**   | `/subscriptions/me`                  | Get current user plan, status and limits               | ✅   | User  |
| **GET**   | `/subscriptions/me/usage`            | Get current user usage and remaining quota             | ✅   | User  |
| **GET**   | `/subscriptions/me/upgrade-requests` | Get current user upgrade request history               | ✅   | User  |
| **GET**   | `/subscriptions/me/checkout-payment-methods` | Get autonomous checkout methods by country (CO/ES) | ✅   | User  |
| **POST**  | `/subscriptions/me/upgrade-requests` | Create a new upgrade request                           | ✅   | User  |
| **POST**  | `/subscriptions/me/upgrade-requests/:id/checkout-session` | Create checkout session with selected country and method | ✅ | User |
| **GET**   | `/subscriptions/me/upgrade-requests/:id/checkout-status` | Poll checkout/activation status for upgrade request | ✅ | User |
| **PATCH** | `/subscriptions/me/pause`            | Pause current user subscription                        | ✅   | User  |
| **PATCH** | `/subscriptions/me/cancel`           | Cancel current user subscription                       | ✅   | User  |
| **PATCH** | `/subscriptions/me/reactivate`       | Reactivate current user subscription                   | ✅   | User  |
| **PATCH** | `/subscriptions/admin/users/:userId/plan`  | Upgrade/downgrade target user plan                     | ✅   | Admin |
| **GET**   | `/subscriptions/admin/users/:userId/usage` | Get target user usage snapshot and entitlement context | ✅   | Admin |
| **GET**   | `/subscriptions/admin/upgrade-requests`     | List upgrade requests for review                       | ✅   | Admin |
| **PATCH** | `/subscriptions/admin/upgrade-requests/:id` | Update upgrade request status and admin response       | ✅   | Admin |

### Approval Model (Auto + Exceptions)

- Default behavior: requests are auto-approved and users can go directly to checkout.
- Exception behavior: requests are routed to admin review queue when special conditions apply.
- Admin queue endpoint (`GET /subscriptions/admin/upgrade-requests`) returns only active exceptions by default (`open`, `reviewing`) unless a specific `status` filter is sent.

### Create Upgrade Request Payload (Optional Manual Review Flag)

```json
{
    "targetPlan": "enterprise",
    "notes": "Need invoice and custom contract terms",
    "requiresManualReview": true
}
```

Use `requiresManualReview=true` only when manual handling is needed.

### Payment Webhook (No Auth)

| Method   | Endpoint                                  | Description                              | Auth | Role |
| -------- | ----------------------------------------- | ---------------------------------------- | ---- | ---- |
| **POST** | `/subscriptions/payments/webhook`         | Receives payment provider confirmation (Stripe or CO direct) and closes approved request automatically | ❌ | System |

### Create Checkout Session Payload

```json
{
    "country": "CO",
    "paymentMethod": "pse"
}
```

Supported combinations:

- `CO`: `pse` (transferencia bancaria local), `bancolombia_button`, `card`
- `ES`: `card`, `bizum`, `sepa_debit`

Provider routing behavior:

- Default: Stripe for all countries/methods.
- Optional for Colombia: when `COLOMBIA_DIRECT_PAYMENTS_ENABLED=true`,
    `pse` and `bancolombia_button` will try the direct Colombia integration first.
- If direct integration fails, system falls back to Stripe unless
    `COLOMBIA_DIRECT_PAYMENTS_STRICT=true`.

### Required Environment Variables (Autonomous Checkout)

```bash
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# One-time upgrade amounts in the smallest currency unit
# COP has no decimals (example: 99000 = COP 99,000)
STRIPE_AMOUNT_GROWTH_COP=99000
STRIPE_AMOUNT_ENTERPRISE_COP=299000

# EUR uses cents (example: 2900 = EUR 29.00)
STRIPE_AMOUNT_GROWTH_EUR=2900
STRIPE_AMOUNT_ENTERPRISE_EUR=9900

# Optional USD fallback when COP is not supported by the Stripe account
STRIPE_AMOUNT_GROWTH_USD=2900
STRIPE_AMOUNT_ENTERPRISE_USD=9900

FRONTEND_URL=http://localhost:5173

# Optional Colombia direct payment integration
COLOMBIA_DIRECT_PAYMENTS_ENABLED=false
COLOMBIA_DIRECT_PAYMENTS_STRICT=false
COLOMBIA_DIRECT_PROVIDER_NAME=co_direct
COLOMBIA_DIRECT_BASE_URL=
COLOMBIA_DIRECT_API_KEY=
COLOMBIA_DIRECT_WEBHOOK_SECRET=
COLOMBIA_DIRECT_PSE_ENDPOINT=/payments/pse/checkout
COLOMBIA_DIRECT_BANCOLOMBIA_ENDPOINT=/payments/bancolombia/checkout
COLOMBIA_DIRECT_TIMEOUT_MS=15000
```

---

### ePayco Integration (Colombia only)

| Method   | Endpoint                                             | Description | Auth | Role |
| -------- | ---------------------------------------------------- | ----------- | ---- | ---- |
| **GET**  | `/subscriptions/me/upgrade-requests/:id/epayco-params` | Returns ePayco widget params for the checkout page | ✅ | User |
| **POST** | `/subscriptions/payments/epayco/confirmation`        | Server-to-server confirmation callback from ePayco | ❌ | System |
| **GET**  | `/subscriptions/payments/epayco/response`            | Browser redirect after ePayco payment (Success/Cancel) | ❌ | System |
| **POST** | `/subscriptions/payments/epayco/response`            | Same as GET, handles form POST variant | ❌ | System |

#### ePayco checkout flow

1. User selects country `CO` + method `epayco` in Billing.
2. Frontend calls `POST /me/upgrade-requests/:id/checkout-session` with `{ country: "CO", paymentMethod: "epayco" }`.
3. Backend generates a unique reference and returns `checkoutUrl = /billing/epayco-checkout?requestId=...`.
4. Frontend redirects to `/billing/epayco-checkout`.
5. That page fetches params via `GET /me/upgrade-requests/:id/epayco-params` and opens the ePayco JS widget.
6. User pays. ePayco calls `EPAYCO_CONFIRMATION_URL` (server-to-server) — **this is the only trusted activation source**.
7. Backend validates SHA-256 signature, activates plan, sends activation email.
8. ePayco redirects browser to `EPAYCO_RESPONSE_URL` which redirects to `/billing/payment-success?requestId=...`.
9. `PaymentSuccess.jsx` polls for plan activation and shows success screen.

#### ePayco Signature Validation

```
SHA-256(p_cust_id_cliente ^ p_key ^ x_ref_payco ^ x_transaction_id ^ x_amount ^ x_currency_code)
```

The `^` is a literal caret separator. The private key (`EPAYCO_PRIVATE_KEY`) is **never** sent to the frontend.

#### Required Environment Variables

```bash
# ePayco credentials — from your ePayco dashboard
EPAYCO_PUBLIC_KEY=your_public_key
EPAYCO_PRIVATE_KEY=your_private_key
EPAYCO_P_CUST_ID=your_customer_id

# "TRUE" for sandbox/test mode, "FALSE" for production
EPAYCO_TEST=TRUE

# Public URLs where ePayco will call back
# These must be accessible from ePayco's servers (no localhost in prod)
EPAYCO_RESPONSE_URL=https://api.ohnix.co/api/v1/subscriptions/payments/epayco/response
EPAYCO_CONFIRMATION_URL=https://api.ohnix.co/api/v1/subscriptions/payments/epayco/confirmation

# Amount in COP (smallest unit, no decimals)
# If not set, falls back to STRIPE_AMOUNT_*_COP
EPAYCO_AMOUNT_GROWTH_COP=99000
EPAYCO_AMOUNT_ENTERPRISE_COP=299000
```

---

### Factus Integration (Colombia Electronic Invoicing)

There is no webhook endpoint. Every request/field below is verified against
the official Factus V2 Postman collection (`api-factus-v2.json`), which is
the source of truth for this integration - it disagrees with the public docs
site in places (e.g. the docs site advertises `/v1/credit-notes/validate`;
the collection and the real API only expose `/v2/credit-notes/validate`).
The collection has zero webhook/event-push endpoints, and every "crear y
validar" call (bills, credit notes, debit notes, support documents) responds
synchronously with the final validation result in the same HTTP response -
there is nothing async to receive a callback for. A webhook route existed
here previously and was removed on 2026-08-04 for that reason; if Factus
support ever confirms a real async event-push feature, reintroduce it and
its own env var.

Order-scoped invoicing/credit-note endpoints are listed in the Orders table
above (`/orders/:id/electronic-invoice*`). `GET /electronic-invoices` lists
all invoices for the requester (or all companies for admins).

#### Required Environment Variables

```bash
# Sandbox vs production: switch by uncommenting one FACTUS_BASE_URL line,
# no code changes needed anywhere - everything reads from this variable.
# FACTUS_BASE_URL=https://api-sandbox.factus.com.co
FACTUS_BASE_URL=https://api.factus.com.co
FACTUS_AUTH_PATH=/oauth/token
FACTUS_INVOICE_PATH=/v2/bills/validate
FACTUS_INVOICE_STATUS_PATH=/v2/bills/{number}
FACTUS_CREDIT_NOTE_PATH=/v2/credit-notes/validate

# grant_type used against /oauth/token. The official collection only ever
# demonstrates "password" (+ "refresh_token" to renew) - it does NOT include
# a client_credentials example anywhere. Keep this as "password" unless
# Factus support explicitly confirms client_credentials works for your
# account.
FACTUS_AUTH_MODE=password

# Real credentials, obtained from your Factus account/portal (or Factus
# support). Treat as secrets.
FACTUS_CLIENT_ID=
FACTUS_CLIENT_SECRET=
FACTUS_USERNAME=
FACTUS_PASSWORD=

# Optional dev/testing shortcut ONLY - Factus access tokens expire hourly,
# so this is not viable for production.
FACTUS_ACCESS_TOKEN=

FACTUS_TIMEOUT_MS=20000
```

There is no `FACTUS_API_KEY` - no request in the official collection carries
an `x-api-key` header, only `Authorization: Bearer <token>`.

Factus V2 issuance is enabled only when the company has `countryCode=CO`,
`electronicInvoicingEnabled=true` and a `factusNumberingRangeId`. Credit
notes additionally require `factusCreditNoteNumberingRangeId` - Factus
requires a numbering range dedicated to each document type (invoices are
document code 21, credit notes are 22; they cannot share a range). The
customer must have its DIAN identification and municipality fields, and each
product must have its DIAN unit/tax configuration.

### Stripe Dashboard Requirements (CO/ES)

Enable these payment methods in Stripe for the account/environment being tested:

- Colombia: `pse`, `bancolombia`, `card`
- Spain: `card`, `bizum`, `sepa_debit`

If a method is not enabled in Stripe Dashboard, checkout creation for that method may fail or the method may not appear in the hosted checkout UI.

### Colombia Direct Webhook Contract (Optional)

Use the same endpoint: `/subscriptions/payments/webhook`

Recommended headers:

- `x-payment-provider: co_direct`
- `x-webhook-secret: <COLOMBIA_DIRECT_WEBHOOK_SECRET>` (if configured)

Accepted payload example for success:

```json
{
    "provider": "co_direct",
    "type": "payment.succeeded",
    "data": {
        "upgradeRequestId": "req_123",
        "sessionId": "pay_456",
        "checkoutUrl": "https://..."
    }
}
```

### Local Webhook Test (Developer Mode)

1. Start backend server.
2. Forward Stripe events to local webhook endpoint:

```bash
stripe listen --forward-to http://localhost:3001/api/v1/subscriptions/payments/webhook
```

3. Copy generated `whsec_...` and set `STRIPE_WEBHOOK_SECRET`.
4. Create upgrade request as user.
5. If it is auto-approved, continue directly to checkout. If it is marked as exception, admin should review/approve first.
6. Create checkout session from Billing with country + method (for example CO + PSE).
7. Complete test payment in Stripe Checkout.

### Expected State Transition After Successful Payment

- Upgrade request: `approved` -> `closed`
- Subscription plan: `currentPlan` -> `targetPlan`
- Payment fields:
    - `paymentStatus`: `succeeded`
    - `paidAt`: populated

### Troubleshooting

- `Invalid webhook signature`:
    - verify raw webhook route registration is before JSON parser in app middleware chain.
    - verify `STRIPE_WEBHOOK_SECRET` matches current `stripe listen` session.
- `Unsupported payment method for country`:
    - check payload `country` + `paymentMethod` combination.
    - check method enablement in Stripe Dashboard.
- Request remains `approved` after payment:
    - verify webhook forwarding is active and hitting `/subscriptions/payments/webhook`.
    - inspect backend logs for webhook processing errors.

---

## 🏢 Company APIs

Platform-level company administration (Admin only).

| Method    | Endpoint                    | Description                          | Auth | Role  |
| --------- | --------------------------- | ------------------------------------ | ---- | ----- |
| **GET**   | `/companies/admin`          | List all companies                   | ✅   | Admin |
| **POST**  | `/companies/admin`          | Create a managed company             | ✅   | Admin |
| **PATCH** | `/companies/admin/:companyId` | Update company profile and active state | ✅   | Admin |

---

## 🔒 Authentication & Authorization

### JWT Token Authentication

Ohnix by iTCycle uses **JSON Web Tokens (JWT)** for secure authentication. Include the access token in the request header:

```
Authorization: Bearer <your_access_token>
```

### Token Lifecycle

| Token Type        | Expiry  | Storage          | Purpose            |
| ----------------- | ------- | ---------------- | ------------------ |
| **Access Token**  | 1 day   | Client (memory)  | API authentication |
| **Refresh Token** | 10 days | HTTP-only cookie | Token renewal      |

### Role-Based Access Control

| Role      | Access Level  | Permissions                                                                |
| --------- | ------------- | -------------------------------------------------------------------------- |
| **User**  | Own Resources | Full CRUD on own products, orders, customers, suppliers, categories, units |
| **Admin** | All Resources | Full CRUD on all users' data + scheduler management                        |

### Protected Routes

All routes require authentication except:

- `POST /users/register`
- `POST /users/login`
- `POST /users/refresh-token`
- `POST /users/send-reset-otp`
- `POST /users/reset-password`

---

## 📋 Response Structure

### Success Response

```json
{
    "statusCode": 200,
    "data": {
        /* response data */
    },
    "message": "Operation successful",
    "success": true
}
```

### Error Response

```json
{
    "statusCode": 400,
    "data": null,
    "message": "Error message describing what went wrong",
    "success": false,
    "errors": []
}
```

### HTTP Status Codes

| Code    | Description                                       |
| ------- | ------------------------------------------------- |
| **200** | Success - Request completed successfully          |
| **201** | Created - Resource created successfully           |
| **400** | Bad Request - Invalid input or missing parameters |
| **401** | Unauthorized - Missing or invalid authentication  |
| **403** | Forbidden - Insufficient permissions              |
| **404** | Not Found - Requested resource doesn't exist      |
| **500** | Internal Server Error - Server-side error         |

---

## 🎯 Key Features

- ✅ **JWT Authentication** - Secure token-based authentication
- ✅ **Role-Based Access Control** - User and Admin roles
- ✅ **Automated Stock Alerts** - Scheduler for low stock notifications
- ✅ **Purchase Returns** - Complete return processing workflow
- ✅ **Invoice Generation** - PDF invoice creation for orders
- ✅ **Multi-User Support** - Data isolation per user
- ✅ **Image Uploads** - Product, customer, and supplier photos
- ✅ **Real-time Reports** - Comprehensive analytics and insights
- ✅ **Stock Management** - Automatic stock updates on orders/purchases

---

## 📝 Important Notes

- All dates use ISO 8601 format: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss.sssZ`
- File uploads use `multipart/form-data` encoding
- Maximum payload size: 16KB (configurable)
- Stock automatically updates on purchase completion and order creation
- Users can only access their own resources (except admins)
- Purchase status flow: `pending` → `completed` → `returned`
- Order status flow: `pending` → `processing` → `completed` or `cancelled`

---

## 📞 Support & Contact

**GitHub Repository**: [iTCycle/Ohnix](https://github.com/iTCycle/Ohnix)

**Email**: sekharsurya111@gmail.com

---

<div align="center">
  
**Last Updated**: October 15, 2025 | **API Version**: 1.0.0

Made with ❤️ by iTCycle

</div>
