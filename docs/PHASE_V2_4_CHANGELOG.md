# Phase V2.4 Changelog

**Features:**
1. **DocTypes Management (Backend)**:
   - Implemented CRUD endpoints: `POST`, `PUT`, `DELETE` `/api/v2/doctypes`.
   - Persistence via `ConfigService` (using `doctypes-PROJECT.json` or DB if available).

2. **Core V2 UI (DocTypes)**:
   - **Smart Dropdown**: DocType column now shows as text (Read-Only) by default. Drops down only if missing, review needed, or editing.
   - **Bulk Actions**: Added toolbar to apply DocType to multiple selected documents.

3. **Transactions (V2.3 Refined)**:
   - **Idempotent Migration**: Fixed `20240115_transactions_v2_3.js` to safely run on existing DBs without error.
   - **API/UX**: Improved Transaction creation flow with Title suggestions.

4. **Export V2**:
   - Cleaned up XLSX columns (Canonical vs Raw).
   - Added `?includeRaw=1` toggle to optionally include giant JSON blobs (default: excluded).

**Fixes:**
- Fixed `DbDocsAdapter` / `rawJson` consistency issues in automated scripts.
- Verified flow end-to-end with `scripts/smoke_v2_4_pg.js`.
