# Transactions (Cases) V2.3

Group related documents into a single "Transaction" (e.g., Proposal -> Order -> Invoice -> Receipt).

## Data Model
- **Table `transactions`**: Stores the case metadata (Title, Status, Customer).
  - Note: Legacy schema collision handled (reuses `orgId` as `project`).
- **Table `transaction_docs`**: Links documents to transactions with an optional `role`.

## Features
1.  **Create Transaction**:
    - Via "Transações" tab (Manual).
    - Via "Core V2" bulk actions (select docs -> "Create Transaction").
2.  **Linking Logic**:
    - **Manually** add documents to a case.
    - **Auto-Link suggestions** (API `POST /transactions/auto-link`) propose matches based on `references_json` (e.g., Matching PO numbers).
3.  **VAT Filtering**: Extraction logic now ignores strings looking like VAT/NIF (e.g., 9 digits) when identifying PO numbers to improve auto-link quality.

## API Endpoints
- `POST /api/v2/transactions`: Create.
- `GET /api/v2/transactions`: List.
- `GET /api/v2/transactions/:id`: Details + Docs.
- `POST /api/v2/transactions/:id/add-docs`: Link docs.
- `POST /api/v2/transactions/auto-link`: Suggest links.

## Usage
- Go to "Transações (V2)" to manage cases.
- Select documents in "Core V2" and select "📂 Create Transaction" from the actions bar.
