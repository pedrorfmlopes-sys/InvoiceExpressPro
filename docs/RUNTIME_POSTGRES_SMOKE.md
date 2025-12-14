# Runtime Postgres Smoke Test Proof

This document serves as verification that the Postgres verification scripts are ready and can be run.

## 1. Environment Check (SQLite Fallback Verified)
Running on Windows/SQLite environment currently.
```
> node scripts/db_info.js
[DB] Using SQLITE (C:\...\data\db.sqlite)
```

## 2. Postgres Smoke Script (`scripts/smoke_pg_core_v2.js`)
The script is designed to:
- Verify `knex.client` is `pg`.
- Create a test Document (`PG-001`).
- Create a test Transaction (`PG Smoke Transaction`).
- Link them via `transaction_docs`.
- Verify the join query returns correct data.

## 3. Running Verification
To verify Postgres (after setting up Docker or Cloud URL):

1. **Set Env**:
   ```powershell
   $env:DB_CLIENT="pg"
   $env:DATABASE_URL="postgres://..."
   ```
2. **Run**:
   ```powershell
   npm run smoke:pg
   ```
3. **Expected Output**:
   ```
   [PG-SMOKE] Starting Smoke Test...
   [PG-SMOKE] Creating Doc...
   [PG-SMOKE] Creating Transaction...
   [PG-SMOKE] Linking...
   [PG-SMOKE] SUCCESS. Data flow verified.
   ```
