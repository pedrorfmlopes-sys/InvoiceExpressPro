PHASE 4 CHANGELOG
=================

New Features:
- Transactions (Dossiers): Create, Edit, Link Documents.
- Auto-Linking: Heuristic suggestions.
- Zip Export: Download transaction dossier with manifest.

Database Changes:
- Tables: `transactions`, `transaction_links`, `transaction_events`.
- Entitlements: `transactions`, `auto_linking`, `exports_zip` (Pro only).

Backend:
- `TransactionsService`: Core logic.
- `AutoLinkService`: Suggestion logic.
- `ZipService`: Archiving logic.
- Routes: `/api/transactions` (Auth Enforced).

Frontend:
- `TransactionsTab`: Management UI.
- `ExploreTab`: Integration (Link to Transaction button).
- `App.jsx`, `ui.jsx`: Integration of new Tab.

Verification:
- Smoke Tests in `scripts/smoke_phase4.js` (Validated with Pro Plan enforcement).
- Results in `docs/RUNTIME_ENDPOINT_SMOKE_PHASE4.md`.
