# Regression Fixes V2.3

Addressed empty DocType dropdowns and silent suggestion failures.

## Fixes

### 1. Frontend Binding (`CoreV2Tab.jsx`)
- **Problem**: Dropdown value binding was strict and failed if `docTypeId` mismatch occurred, or if `docType` (legacy) was present but `docTypeId` was null.
- **Fix**: Updated binding to prioritize `docTypeId` -> `docTypeLabel` -> `docType`.
- **Edit Mode**: Enabled DocType editing in staging/review states (previously disabled strictly if no options, now more permissive and highlights missing types).

### 2. Missing Routes (`v2Routes.js`)
- **Problem**: During V2.3 merge, several endpoints (`/doctypes`, `/link-suggestions`, `/bulk`) were accidentally dropped.
- **Fix**: Restored all endpoints. This explains why suggestions were "empty" (404) and dropdowns empty (no doctypes loaded).

### 3. Suggestions Debug
- **Feature**: Added `?debug=1` parameter to `GET /api/v2/docs/:id/link-suggestions`.
- **Output**: Returns `debugMap` with `searchedCount` and `reason` for exclusion (e.g., "No heuristic matches").

## Verification
- `scripts/smoke_regression_v2_3.js`:
    - Verified `PATCH` DocType works (simulating UI edit).
    - Verified Suggestions endpoint returns `debugMap` and 200 OK.
