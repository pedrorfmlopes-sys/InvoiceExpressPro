# Integration Parity Report

Comparison between `FRONTEND_API_USAGE` and `BACKEND_ROUTES_DUMP`.

## Status Key
- **OK**: Frontend call matches Backend route (Method + Path).
- **MISSING**: Frontend calls a route that appears totally absent in Backend (404).
- **MISMATCH**: Method differs (e.g. GET vs POST) or Path parameter mismatch.

## Report

| Status | Frontend Call | Backend Route | Notes |
|--------|--------------|---------------|-------|
| **OK** | GET `/api/auth/me` | GET `/api/auth/me` | |
| **OK** | GET `/api/projects` | GET `/api/projects` | |
| **OK** | GET `/api/health` | GET `/api/health` | |
| **OK** | GET `/api/dirs` | GET `/api/dirs` | |
| **MISSING** | POST `/api/mkdir` | - | Used in ProcessTab to create output dirs. **CRITICAL**. |
| **MISSING** | POST `/api/set-output` | - | Used in ProcessTab. **CRITICAL**. |
| **OK** | POST `/api/extract` | POST `/api/extract` | |
| **OK** | GET `/api/progress/:batchId` | GET `/api/progress/:batchId` | |
| **OK** | GET `/api/batch/:batchId` | GET `/api/batch/:batchId` | |
| **OK** | GET `/api/doc/view` | GET `/api/doc/view` | |
| **OK** | PATCH `/api/doc/:id` | PATCH `/api/doc/:id` | |
| **OK** | DELETE `/api/doc/:id` | DELETE `/api/doc/:id` | |
| **OK** | POST `/api/docs/finalize-bulk` | POST `/api/docs/finalize-bulk` | |
| **OK** | POST `/api/doc/finalize` | POST `/api/doc/finalize` | |
| **OK** | GET `/api/config/doctypes` | GET `/api/config/doctypes` | |
| **MISSING** | PUT `/api/config/doctypes` | - | Frontend uses PUT to save, Backend only has GET? |
| **OK** | GET `/api/config/secrets` | GET `/api/config/secrets` | |
| **OK** | POST `/api/config/secrets` | POST `/api/config/secrets` | Validated in Hotfix. |
| **MISSING** | POST `/api/app-logo` | - | ConfigTab upload. |
| **MISMATCH** | GET `/api/reports/pro-pdf` | POST `/api/reports/pro-pdf` | Frontend uses GET, Backend expects POST. |
| **MISSING** | GET `/api/export.csv` | - | ReportsTab link. |
| **MISSING** | GET `/api/reports.xlsx` | - | ReportsTab link. |
| **MISMATCH** | GET `/api/export.xlsx` | POST `/api/export.xlsx` | Frontend link uses GET, Backend expects POST. |
| **OK** | GET `/api/excel.json` | GET `/api/excel.json` | |
| **MISSING** | POST `/api/excel/refresh` | - | ExploreTab refresh. |
| **OK** | GET `/api/transactions/` | GET `/api/transactions/` | |
| **OK** | POST `/api/transactions/:id/link` | POST `/api/transactions/:id/link` | |
| **OK** | GET `/api/templates` | GET `/api/templates/` | Trailing slash might matter. |
| **MISSING** | POST `/api/templates` | - | TeacherTab save. |
| **OK** | GET `/api/normalize` | GET `/api/normalize/` | |
| **MISSING** | POST `/api/normalize` | - | NormalizationTab add. |
| **MISSING** | DELETE `/api/normalize` | - | NormalizationTab delete. |

## Summary of Critical Fixes Needed
1.  **ProcessTab**: `mkdir` and `set-output` are missing. Without them, users cannot set destination folders.
2.  **Config**: `PUT doctypes` missing (cannot save types). `app-logo` missing.
3.  **Reports**: Method mismatches for exports (GET vs POST). Links in frontend `<a href>` imply GET, but backend is POST.
4.  **Normalization**: Write operations missing.
