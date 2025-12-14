# V2.5 Review Pack

This document consolidates changes for Phase V2.5: **Frontend Auth**, **Pagination & Search**, **CI Smoke Tests**, **Self-Host Scripts**, and **Feature Flags**.

## 1. Frontend Auth
**Path**: `client/src/api/apiClient.js`
**Path**: `client/src/components/Login.jsx`

**Summary**: 
Centralized `axios` client handles token injection and 401 retries (redirect to login). Hardened to prevent 401 loops using `isAuthFailing` lock.

**Critical Snippet: Auth Interceptor & Retry (Hardened)**
```javascript
// client/src/api/apiClient.js (Lines 24-48)
let isAuthFailing = false;

api.interceptors.response.use(response => response, async error => {
    const originalRequest = error.config;

    // Retry once on 401 to handle expiration or initial fail
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
        if (isAuthFailing) return Promise.reject(error); // Prevent multiple alerts/redirects

        originalRequest._retry = true;
        isAuthFailing = true; // Lock

        // LOGOUT ON 401 - Session Dead
        localStorage.removeItem('token');
        onAuthFailure();
        
        // Reset lock after a short delay
        setTimeout(() => { isAuthFailing = false; }, 2000);

        return Promise.reject(error);
    }
    return Promise.reject(error);
});
```

## 2. Pagination & Search (Backend)
**Path**: `server/src/controllers/v2/coreController.js`
**Path**: `server/src/storage/DbDocsAdapter.js`

**Summary**: 
`GET /api/v2/docs` supports `page`, `limit` (clamped), `q`, `status`, `docType`, `from`, `to`. Adapter uses correct count logic and cross-DB search (ILIKE for PG).

**Critical Snippet: DB Adapter (Knex Search & Count)**
```javascript
// server/src/storage/DbDocsAdapter.js (Lines 17-33)
if (q) {
    const isPg = knex.client.config.client === 'pg';
    const op = isPg ? 'ilike' : 'like'; // PG: Case-insensitive
    const like = `%${q}%`;

    query = query.where((b) => {
        b.where('docNumber', op, like)
         .orWhere('supplier', op, like)
         .orWhere('customer', op, like)
         .orWhere('origName', op, like);
    });
}

// Count: Must be clean (remove limit/offset/order)
const countQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
const totalParams = await countQuery;
const total = parseInt(totalParams.count || totalParams['count(*)'] || 0, 10);
```

## 3. CI Smoke Tests
**Path**: `.github/workflows/ci-smoke.yml`

**Summary**: 
GitHub Actions workflow checks SQLite and Postgres (v16). Includes readiness checks for DB (`pg_isready`) and Server before running smoke tests.

**Critical Snippet: Postgres Job & Readiness**
```yaml
# .github/workflows/ci-smoke.yml (Lines 34-69)
  smoke-postgres:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: invoicestudio
          POSTGRES_PASSWORD: mysecretpassword
          POSTGRES_DB: invoicestudio
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-retries 5
    steps:
      # ... checkout & setup ...
      
      # Wait for PG to be truly ready
      - name: Wait for PG
        run: |
          until pg_isready -h localhost -p 5432 -U invoicestudio; do
            sleep 2
          done
      
      - name: Start Server & Smoke (PG)
        run: |
          npm start &
          PID=$!
          echo "Waiting for server..."
          sleep 5
          node scripts/smoke_v2_4_pg.js
          kill $PID
```

## 4. Diff Summary
Recent hardening changes (Auth + Pagination + CI):

```text
 .github/workflows/ci-smoke.yml             | 30 ++++++++++++++---------
 client/src/api/apiClient.js                | 14 +++++++----
 server/src/controllers/v2/coreController.js|  6 ++++-
 server/src/storage/DbDocsAdapter.js        | 21 +++++++++-------
 4 files changed, 45 insertions(+), 26 deletions(-)
```

## 5. Known Limitations
- **Token Expiry**: Redirects to login on 401. No silent refresh yet.
- **Search Performance**: `ILIKE %q%` scans are expensive on large tables without Trigram indexes.
- **Blob Downloads**: Large files load into memory.
- **Concurrency**: SQLite WAL mode recommended for high write volume.
