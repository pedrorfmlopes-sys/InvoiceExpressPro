# MODULE REUSE MAP - Reports V2

## Overview
This document inventories existing components to reuse for the new "Reports V2" module. The goal is zero functional regression and maximum code efficiency by wrapping reliable V1 logic in V2 modular contracts.

## 1. Backend Reuse

| Component | Path | Action | Reasoning |
| :--- | :--- | :--- | :--- |
| **PDF Engine** | `server/reports-pdf.js` | **REUSE** | Contains complex logic for canvas/layout/tables. V2 will wrap this via `buildPDF`. |
| **Doc Service** | `server/src/services/DocService.js` | **REUSE** | Core data fetching (`getDocs`). V2 will call this and then aggregate in-memory (or via DB if optimized later). |
| **Export Stream** | `server/src/controllers/exportController.js` | **REUSE** | Streaming XLXS generation is robust and handles large datasets. V2 endpoint will internally delegate or duplicate logic (minimal adapter). |
| **Entitlements** | `server/src/middlewares/entitlements.js` | **REUSE** | Standard `requireEntitlement` middleware is perfect for V2 switch toggles. |
| **Auth Middlewares** | `server/src/middlewares/auth.js` | **REUSE** | `req.ctx` handling is standard. |

## 2. Frontend Reuse

| Component | Path | Action | Reasoning |
| :--- | :--- | :--- | :--- |
| **HTTP Client** | `client/src/api/apiClient.js` | **REUSE** | Handles 401/Refresh loops automatically. |
| **UI Utils** | `client/src/shared/ui.jsx` | **REUSE** | `downloadFile` (Blob handling) and formatting helpers (`fmtEUR`) are reusable. |
| **Layout** | `(various)` | **NEW** | V2 Layout should be built fresh in `client/src/modules/reportsV2/` to avoid legacy CSS/DOM entanglements. |

## 3. New Components (V2 Contract)

| Component | Path | Purpose |
| :--- | :--- | :--- |
| **Module Root** | `server/src/modules/reportsV2/index.js` | Entry point, mounts router, exports metadata. |
| **DTO Layer** | `server/src/modules/reportsV2/dto.js` | Enforces `{ meta, filters, rows }` shape, decoupling internal DB changes from API contract. |
| **Aggregator** | `server/src/modules/reportsV2/service.js` | Logic for "Top N" and "Monthly" calculation (refactored from `reportsController.js` but cleaner). |
| **V2 Tab** | `client/src/modules/reportsV2/ReportsV2Tab.jsx` | Fresh React component ensuring modularity and entilement checks. |

## 4. Feature Switches (Entitlements)

| Key | Description | Default |
| :--- | :--- | :--- |
| `reports_v2` | Enables the main V2 Tab. | `false` (until ready) |
| `reports_export` | Enables CSV/XLSX buttons. | `true` |
| `reports_pdf_basic` | Enables Basic PDF. | `true` |
| `reports_pdf_pro` | Enables AI/Pro PDF. | `false` |
