# Finalize Validation Fix Proof

**Bug:** `Finalize` blocked valid documents because it checked `!docType` (legacy) which might be empty if `docTypeLabel` (canonical) was used.

**Fix:**
1. **Robust Check**: `finalize` now checks `docType || docTypeLabel || docTypeId`.
2. **Fresh State**: It looks up the row in `rows` state by ID to avoid stale closure data.
3. **UX**: Alert is now in Portuguese and specific ("Falta: Nº do documento").

**Verification Script Output (`scripts/verify_finalize_fix.js`):**
```
Running Finalize Logic Verification:
[OK] Empty: FAIL: Falta: Tipo do documento, Nº do documento
[OK] Legacy Only: PASS
[OK] Canonical Only: PASS
[OK] Review Pending: FAIL: Falta: Tipo do documento
[OK] No Number: FAIL: Falta: Nº do documento
```

The logic correctly identifies valid documents even if only `docTypeLabel` (Canonical) is present.
