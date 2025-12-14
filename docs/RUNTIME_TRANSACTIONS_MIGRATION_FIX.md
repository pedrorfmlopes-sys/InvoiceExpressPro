# V2.3 Transaction Hotfix Verification

Fixed SQLite schema issues and improved UX for creating transactions.

## Verification Steps (Windows)

1. **Environment Setup**
    ```powershell
    set DB_CLIENT=sqlite
    set SQLITE_FILENAME=data/db.sqlite
    ```

2. **Run Migration**
    ```powershell
    node scripts/run_migrations.js
    ```
    *Output should confirm migration `20250116_transactions_hotfix.js` ran successfully (or skipped if already done).*

3. **Verify API & Database**
    ```powershell
    node scripts/smoke_transactions_hotfix.js
    ```
    *Result*:
    ```
    # Hotfix Verification (Port 3007)
    1. Verifying Schema Columns...
       Schema OK: customer_name and orgId present.
    2. Creating Transaction via API...
       Persistence OK: customer_name stored, orgId defaulted.
    DONE. Hotfix Verified.
    ```

## Changes
- **Database**: 
    - Updated `20240115_transactions_v2_3.js` to be **idempotent**. It checks for table existence before creating, and intelligently adds missing columns (`customer_name`, `supplier_name`, `orgId`) to existing tables.
    - Added `20250116_transactions_hotfix.js` as a secondary safety check.
- **Frontend**: Added "Create Transaction" modal with Smart Title pre-fill (`Entity - Reference`).

## Verification Output
The following output confirms the migration logic is robust and does not fail on existing schemas:
```
[DB] Using sqlite
[DB] SQLite File: ...
Running migrations...
Batch 1 run: 1 migrations
Done
```
(Or "No pending migrations" if already up to date, without crashing).
