# Auto-Link Reason Codes

The system suggests linking documents based on the following heuristics (confidence scores in parentheses):

- **Ref Validation (0.9)**: The extracted `PO` or `Reference` value of one document appears in the text/docNumber of another document.
- **Same Amount (Simulated) (0.2)**: Total amounts match exactly.
- **Supplier Match (Simulated) (0.1)**: Supplier names match.

## Improvements in V2.3
- **VAT Filtering**: The regex extraction for PO numbers now filters out values that look like NIFs/VATs (9 digits), preventing false positive links based on company tax IDs being matched as "PO Numbers".
