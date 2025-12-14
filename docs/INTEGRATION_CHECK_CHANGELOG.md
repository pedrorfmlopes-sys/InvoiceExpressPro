# Integration Check Changelog

## Artifacts Created
- `docs/FRONTEND_API_USAGE.md`: Inventory of frontend API calls.
- `docs/BACKEND_ROUTES_DUMP.md`: Dump of Express backend routes.
- `docs/INTEGRATION_PARITY_REPORT.md`: Analysis of matches/mismatches.
- `docs/RUNTIME_INTEGRATION_SMOKE.md`: Runtime verification results.
- `scripts/dump_express_routes.js`: Tool to dump routes.
- `scripts/integration_smoke.js`: Tool to verify endpoints.

## Fixes Implemented
### Critical (Blocking Extract/Upload Flow)
- **Project Controller/Routes**:
    - Added `POST /api/mkdir` (creating directories).
    - Added `POST /api/set-output` (preference setting).
    - Added `POST /api/app-logo` (linked to `configController.uploadLogo`).
- **Config Controller/Routes**:
    - Added `PUT /api/config/doctypes` (saving doc types).
    - Added `exports.setDocTypes` and `exports.uploadLogo`.
- **Normalize Controller/Routes**:
    - Added `POST /api/normalize` and `DELETE /api/normalize` (rule management).

## How to Run Checks
1. Ensure server is running (`npm start` or similar) on port 3000.
2. Run Smoke Test:
   ```bash
   node scripts/integration_smoke.js
   ```
3. Check `docs/RUNTIME_INTEGRATION_SMOKE.md` for PASS/FAIL status.

## Remaining Known Issues
- `ReportsTab` uses GET for `pro-pdf` and export links, but backend has `POST`. This requires a decision to either allow GET in backend or refactor frontend to use download-via-POST logic.
- `TeacherTab` uses `POST /api/templates` which is missing.

Status: **COMPLETE**
