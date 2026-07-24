# PostgreSQL Migration Guide (MongoDB -> PostgreSQL)

This project now includes Prisma schema and a migration script to move existing MongoDB data into PostgreSQL.

## 1) Create a free PostgreSQL database

You can use either:
- Neon (recommended free hosted PostgreSQL)
- Supabase (free hosted PostgreSQL)

Copy your connection string and set it in `.env` as `DATABASE_URL`.

Example:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

## 2) Ensure required env vars exist

In `Backend/.env` you need:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

`MONGODB_URI` is used as the source for data migration.
`DATABASE_URL` is the PostgreSQL destination.

## 3) Create PostgreSQL schema

Run from `Backend/`:

```bash
npm run prisma:push
npm run prisma:generate
```

## 4) Migrate data from MongoDB to PostgreSQL

Run from `Backend/`:

```bash
npm run db:migrate:mongo-to-pg
```

This script migrates in this order:
1. users
2. categories
3. units
4. suppliers
5. customers
6. products
7. purchases
8. orders
9. purchase details
10. order details

## 5) Important note about runtime

The current API runtime still uses Mongoose models. This migration setup prepares your PostgreSQL schema and data, but controllers/services still need to be migrated from Mongoose queries to Prisma queries to run fully on PostgreSQL.

## 6) Recommended phased rollout

1. Keep MongoDB as production source while validating PostgreSQL data.
2. Migrate read-only endpoints first (reports/lists) to Prisma.
3. Migrate write flows with transactions (orders/purchases).
4. Switch auth/user flow.
5. Remove MongoDB dependency when all endpoints run on Prisma.

## 7) Useful commands

```bash
npm run prisma:push
npm run prisma:generate
npm run db:migrate:mongo-to-pg
```
