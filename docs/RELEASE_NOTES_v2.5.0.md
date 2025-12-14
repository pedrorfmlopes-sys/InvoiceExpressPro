# Release Notes v2.5.0 - Frontend Auth, Pagination & Hardening

**Date:** 2025-01-24

## 🚀 Key Features

### Frontend Authentication
- **Login UI**: New dedicated Login component used when `AUTH_MODE=required`.
- **Authenticated Client**: Centralized `apiClient.js` automatically injects Bearer token.
- **Robust 401 Handling**: "Single-flight" guard prevents logout loops on auth failure.
- **Security**: Token storage in LocalStorage; strict session invalidation on 401.

### Core V2 Pagination & Search
- **Server-side Pagination**: `GET /api/v2/docs` supports `page` and `limit`.
- **Advanced Filtering**: Filters for `status`, `docType`, `from/to` dates.
- **Search**: Case-insensitive search (`ilike` on Postgres, `like` on SQLite) across multiple fields.
- **UI**: New paginated table in `CoreV2Tab` with search bar and filter dropdowns.

### CI & Infrastructure
- **Smoke Tests**: GitHub Actions workflow now runs smoke tests against **SQLite** and **Postgres 16**.
- **Readiness Checks**: CI waits for DB and Server health check before running tests (no flaky sleeps).
- **Self-Host Support**: New `SELF_HOST_QUICKSTART.md` and Windows helper scripts (`start_pg.cmd`).

## 🛠 Improvements & Hardening
- **Feature Flags**: Legacy tabs (`Process`, `Teacher`) hidden by default behind `VITE_ENABLE_LEGACY`.
- **DB Adapter**: Fixed total count logic to be independent of page limits.
- **Postgres Alignment**: Docker Compose alignment with Postgres 16 environment variables.

## 📦 Artifacts
- `docs/SELF_HOST_QUICKSTART.md`: Quickstart guide.
- `docs/V2_5_REVIEW_PACK.md`: Technical overview of changes.
