# RUNTIME V2.4 SMOKE TEST

**Date:** 2025-12-14
**Status:** PASSED (SQLite) | PASSED (Postgres)
**Script:** `scripts/smoke_v2_4_pg.js`

## 1. SQLite (Verified)
**Config:** `DB_CLIENT=sqlite` | `AUTH_MODE=required`

```
--- SMOKE TEST V2.4 (Auth Aware) ---
[Test Config] DB_CLIENT: sqlite (default)
[Test Config] AUTH_MODE: required
0. Authenticating...
   - Login successful
1. Testing DocTypes CRUD...
   - Created DocType
   - Listed DocTypes
2. Uploading & Extracting...
[DB] Using SQLITE (C:\Users\pedro\OneDrive\APPS\GitHub\data\db.sqlite)
   - Inserted Dummy Doc: smoke_test_doc_1765676676128
3. Testing Bulk Patch...
   - Bulk Patch Verified
4. Creating Transaction...
   - Transaction Created: 7dca5870-433d-4daf-9d35-bf0147688cf7
5. Linking Docs...
   - Linked successfully
6. Exporting XLSX...
   - Export downloaded bytes: 21329
--- OK: ALL V2.4 TESTS PASSED ---
```

## 2. Postgres (Verification Instructions)

**Config:** `DB_CLIENT=pg` | `DATABASE_URL=postgres://...` | `AUTH_MODE=required`

### How to Run
Run the following commands in your terminal (PowerShell or Bash) to verify against a Postgres instance:

**Windows (PowerShell):**
```powershell
# 1. Start your Postgres Docker/Service
# 2. Set Env & Run Migrations
$env:DB_CLIENT="pg"
$env:DATABASE_URL="postgres://user:pass@localhost:5432/invoicestudio_v2_4"
$env:AUTH_MODE="required"
$env:JWT_SECRET="test_secret_key"

# Ensure DB exists (create manually if needed) or let knex try? (Knex expects DB to exist)
# npm run db:migrate

# 3. Start Server (in separate terminal)
# $env:DB_CLIENT="pg"; $env:DATABASE_URL=...; node server/server.js

# 4. Run Smoke Test
node scripts/smoke_v2_4_pg.js
```

### Expected Output (Postgres)
You should see:
```
--- SMOKE TEST V2.4 (Auth Aware) ---
[Test Config] DB_CLIENT: pg
[Test Config] AUTH_MODE: required
[DB] Using POSTGRESQL (postgres://****@localhost...)
0. Authenticating...
   - Login successful
...
--- OK: ALL V2.4 TESTS PASSED ---
```

### Evidence Log
```
--- SMOKE TEST V2.4 (Auth Aware) ---
[Test Config] DB_CLIENT: pg
[Test Config] AUTH_MODE: required
0. Authenticating...
   - Login successful
1. Testing DocTypes CRUD...
   - Created DocType
   - Listed DocTypes
2. Uploading & Extracting...
[DB] Using POSTGRESQL (postgres://invoicestudio:****@127.0.0.1:5432/invoicestudio)
   - Inserted Dummy Doc: smoke_test_doc_1765677601072
3. Testing Bulk Patch...
   - Bulk Patch Verified
4. Creating Transaction...
   - Transaction Created: eecb3d29-9317-4583-a9be-490958438bef
5. Linking Docs...
   - Linked successfully
6. Exporting XLSX...
   - Export downloaded bytes: 35132
--- OK: ALL V2.4 TESTS PASSED ---
```
