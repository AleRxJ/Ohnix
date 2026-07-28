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
| **POST** | `/subscriptions/payments/webhook`         | Receives payment provider confirmation and closes approved request automatically | ❌ | System |

### Create Checkout Session Payload

```json
{
    "country": "CO",
    "paymentMethod": "pse"
}
```

Supported combinations:

- `CO`: `pse` (otros bancos), `bancolombia_button`, `card`
- `ES`: `card`, `bizum`, `sepa_debit`

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

FRONTEND_URL=http://localhost:5173
```

### Stripe Dashboard Requirements (CO/ES)

Enable these payment methods in Stripe for the account/environment being tested:

- Colombia: `pse`, `card` (the `bancolombia_button` option is routed through PSE)
- Spain: `card`, `bizum`, `sepa_debit`

If a method is not enabled in Stripe Dashboard, checkout creation for that method may fail or the method may not appear in the hosted checkout UI.

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
