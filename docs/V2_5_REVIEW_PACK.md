# V2.5 Review Pack

This document consolidates changes for Phase V2.5: **Frontend Auth**, **Pagination & Search**, **CI Smoke Tests**, **Self-Host Scripts**, and **Feature Flags**.

## 1. Frontend Auth
**Path**: `client/src/api/apiClient.js`
**Path**: `client/src/components/Login.jsx`

**Summary**: 
Centralized `axios` client handles token injection and 401 retries (redirect to login). `Login.jsx` provides the UI. `App.jsx` guards routes based on `isAuthenticated`.

**Critical Snippet: Auth Interceptor & Retry**
```javascript
// client/src/api/apiClient.js (Lines 15-46)
api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`; // Injection
    return config;
}, error => Promise.reject(error));

api.interceptors.response.use(response => response, async error => {
    const originalRequest = error.config;
    // Retry once on 401 to handle expiration or initial fail
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        localStorage.removeItem('token');
        onAuthFailure(); // Triggers Logout UI in App.jsx
        return Promise.reject(error);
    }
    return Promise.reject(error);
});
```

**Critical Snippet: Login Flow**
```javascript
// client/src/components/Login.jsx (Lines 10-17)
async function handleSubmit(e) {
    e.preventDefault();
    try {
        await login(email, password); // Calls /api/auth/login
        onLoginSuccess(); // Updates App state -> isAuthenticated = true
    } catch (err) {
        setError('Login failed. Check credentials.');
    }
}
```

## 2. Pagination & Search (Backend)
**Path**: `server/src/controllers/v2/coreController.js`
**Path**: `server/src/storage/DbDocsAdapter.js`

**Summary**: 
`GET /api/v2/docs` supports `page`, `limit`, `q` (search), `status`, `docType`, `from`, `to`. Adapter builds Knex query dynamically.

**Critical Snippet: Controller Logic**
```javascript
// server/src/controllers/v2/coreController.js (Lines 281-290)
exports.listDocs = async (req, res) => {
    try {
        const project = req.query.project || 'default';
        const { page = 1, limit = 50, q, status, docType, from, to } = req.query;
        // Pass query params to adapter
        const result = await Adapter.getDocs(project, { 
            page, limit, q, status, docType, from, to 
        });
        res.json(result); // Returns { rows, total, page, limit }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
```

**Critical Snippet: DB Adapter (Knex)**
```javascript
// server/src/storage/DbDocsAdapter.js (Lines 6-35)
async getDocs(project, { page = 1, limit = 50, q, status, docType, from, to } = {}) {
    let query = knex('documents').where({ project });

    if (status) query = query.where('status', status);
    if (q) {
        const like = `%${q}%`;
        query = query.where(b => {
            b.where('docNumber', 'like', like)
             .orWhere('supplier', 'like', like) // Search multiple fields
             .orWhere('customer', 'like', like)
             .orWhere('origName', 'like', like)
        });
    }

    // Pagination
    const rows = await query.orderBy('created_at', 'desc').limit(limit).offset((page - 1) * limit);
    // ... Count logic omitted for brevity ...
    return { rows: ..., total, page, limit };
}
```

## 3. CI Smoke Tests
**Path**: `.github/workflows/ci-smoke.yml`

**Summary**: 
GitHub Actions workflow with two jobs: `smoke-sqlite` (Auth required) and `smoke-postgres` (Service container + Auth). Ensures no regression on either DB.

**Critical Snippet: Postgres Job in CI**
```yaml
# .github/workflows/ci-smoke.yml
smoke-postgres:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:15-alpine
      env:
        POSTGRES_USER: user
        POSTGRES_PASSWORD: password
        POSTGRES_DB: invoicestudio
  env:
    AUTH_MODE: required
    DB_CLIENT: pg
    DATABASE_URL: postgres://user:password@localhost:5432/invoicestudio
  steps:
    - run: npm ci
    - run: npm run db:migrate # Setup Schema
    - name: Start Server & Smoke
      run: |
        npm start &
        node scripts/smoke_v2_4_pg.js # Run verification script
```

## 4. Feature Flags / Legacy
**Path**: `client/src/App.jsx`

**Summary**: 
New `ENABLE_LEGACY` flag hides old tabs (`Process`, `Teacher`, `Reports`, `Audit`) from the sidebar unless explicitly enabled in `.env`.

**Critical Snippet: Config guarding**
```javascript
// client/src/App.jsx (Lines 116-131)
const ENABLE_LEGACY = import.meta.env.VITE_ENABLE_LEGACY === 'true';

const TABS = [
    { id: 'dashboard', label: '📊 Dashboard', Component: ReportsTab },
    { id: 'corev2', label: '📄 Core V2', Component: CoreV2Tab },
    // ...
    ...(ENABLE_LEGACY ? [
        { id: 'process', label: 'Process (V1)', Component: ProcessTab }, // Hidden by default
        // ...
    ] : [])
];
```

## 5. Validation & Scripts

### Run Locally (SQLite + Auth)
```powershell
# 1. Start Server
$env:AUTH_MODE="required"; $env:JWT_SECRET="dev"; npm start
# 2. Run Smoke (in another terminal)
$env:AUTH_MODE="required"; node scripts/smoke_v2_4_pg.js
```

### Run Locally (Postgres + Auth)
Using Helper Scripts (Windows):
```powershell
.\scripts\windows\start_pg.cmd
# ...wait for start...
.\scripts\windows\run_smoke_pg.cmd
```

## 6. Risks & Limitations
- **Token Expiry**: Current client redirects to login on 401. No silent refresh mechanism yet (Phase 3?).
- **Search Performance**: Partial text search (`LIKE %q%`) on large datasets (100k+) in SQLite might be slow without FTS. Postgres handles it better but indexes are simple B-Tree.
- **Concurrent Requests**: Creating multiple transactions quickly might hit concurrency limits in SQLite (WAL mode recommended).
- **Blob Downloads**: `apiClient.downloadFile` loads the whole blob into memory (client-side) before saving. Very large files (>500MB) might crash browser tab.
