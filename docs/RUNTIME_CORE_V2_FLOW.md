# Core V2 Runtime Verification

Run at: 2025-12-13T21:59:49.273Z

Test Server running on port 3001

1. Login: OK

2. Upload: OK (Docs: 1)

   Doc ID: 8e4eb88e-d076-4022-8ecb-e35e12213df6

3. Extract: OK (Results: 1)

   Method: regex, Status: extracted

4. Patch: OK (Type: Fatura V2)

5. Finalize: OK (Status: processado)

6. Export: OK (Size: 19007 bytes)



# V2.1 Feature Verification

Run at: 2025-12-13T22:28:37.937Z

Test Server running on port 3002

1. Login: OK

2. Upload: OK (Doc ID: e025a989-cd9f-4ad7-a9d7-2a877d8f5f5a)

3. Patch Data: OK (Customer: Cliente V2.1, Refs: [{"type":"PO","value":"PO-999"}])

4. Suggestions: OK (Count: 1)

   Top Candidate: PO-999 (Score: 50)

5. Link Created: OK

6. DocTypes: OK (Count: 4)



# V2.2 Feature Verification
Run at: 2025-12-13T22:55:43.521Z
Test Server: 3003
ERROR: insert into `documents` (`docNumber`, `docType`, `docTypeRaw`, `id`, `project`, `status`, `total`) values ('D-V2.2', 'Fattura', 'Fattura', 'v2-2-1765666543522', 'default', 'uploaded', 100) - SQLITE_ERROR: table documents has no column named docTypeRaw


# V2.2 Feature Verification
Run at: 2025-12-13T22:56:31.161Z
Test Server: 3003
ERROR: insert into `documents` (`docNumber`, `docType`, `docTypeRaw`, `id`, `project`, `status`, `total`) values ('D-V2.2', 'Fattura', 'Fattura', 'v2-2-1765666591162', 'default', 'uploaded', 100) - SQLITE_ERROR: table documents has no column named docTypeRaw


# V2.2 Feature Verification
Run at: 2025-12-13T22:57:01.308Z
Test Server: 3003
1. Doc Created (Raw: Fattura)
2. Bulk Patch: null (Expected: Recibo)
ERROR: Bulk patch failed


# V2.2 Feature Verification
Run at: 2025-12-13T22:57:42.384Z
Test Server: 3003
1. Doc Created (Raw: Fattura)
2. Bulk Patch: Recibo (Expected: Recibo)
3. Export: OK (Size: 25801 bytes)
