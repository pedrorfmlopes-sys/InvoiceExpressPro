# Changelog

All notable changes to this project will be documented in this file.

## [v2.5.0] - 2025-01-24

### Added
- **Frontend Auth**: Login UI, central API client with token management (Bearer).
- **Pagination & Search**: Backend support for V2 docs (page/limit/search), UI integration in CoreV2Tab.
- **CI & Infrastructure**: Smoke tests for SQLite and Postgres 16 with readiness checks.
- **Docs**: Self-hosting quickstart (`SELF_HOST_QUICKSTART.md`) and Windows helper scripts.

### Changed
- **Hardening**: Auth client prevents 401 loops (single-flight logout); DB adapter ensures correct total counts (clean query).
- **Legacy**: Hidden V1 tabs (`Process`, `Teacher`) behind `VITE_ENABLE_LEGACY` feature flag.
