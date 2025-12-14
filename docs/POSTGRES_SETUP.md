# Postgres Setup Guide (V3.0)

InvoiceStudio supports PostgreSQL 14+ as a first-class production database.

## Prerequisites
- Node.js 18+
- Docker (for Option 1) OR a Cloud Postgres URL (for Option 2)

---

## Option 1: Local Postgres (Docker)

Use the provided `docker-compose.yml` to spin up a local instance.

1. **Start Database**
   ```bash
   docker-compose up -d
   ```

2. **Configure Environment**
   Set these variables (e.g. in `.env`):
   ```bash
   DB_CLIENT=pg
   DATABASE_URL=postgres://invoicestudio:mysecretpassword@localhost:5432/invoicestudio
   ```

3. **Initialize**
   ```bash
   npm run db:migrate
   ```

4. **Run**
   ```bash
   npm start
   ```

---

## Option 2: Cloud Postgres (Supabase, Neon, RDS)

1. **Get Connection String**
   Obtain the connection string from your provider. It usually looks like:
   `postgres://user:pass@host:5432/dbname?sslmode=require`

2. **Configure Environment**
   ```bash
   DB_CLIENT=pg
   DATABASE_URL="postgres://user:pass@host:5432/dbname?sslmode=require"
   ```

3. **Initialize & Run**
   ```bash
   npm run db:migrate
   npm start
   ```

---

## Verification & Tooling

### Check Connection
Run `npm run db:health` to test connectivity and list tables.
- **Output (PG)**: `[HEALTH] OK. Connected to pg.`
- **Output (SQLite)**: `[HEALTH] OK. Connected to sqlite3.`

### Check Config
Run `npm run db:info` to see which database is currently active (redacted credentials).

### Smoke Test (E2E)
Run `node scripts/smoke_pg_core_v2.js` to simulate a full document flow (Insert Doc -> Create Transaction -> Link).
*Requires DB_CLIENT=pg and valid DATABASE_URL.*

## Migration Notes
- **Indexes**: The system automatically applies performance indexes for `project`, `status`, `docNumber`.
- **Foreign Keys**: Enforced on both Postgres and SQLite.
