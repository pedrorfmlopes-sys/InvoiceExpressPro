# Agent Action Plan: Frontend Remediation

## Prioritized Issues

### 1. 🟥 Critical: Login/Bootstrap Failure
**Risk:** Users cannot access the application. Smoke tests are blocked.
**Root Cause:**
- Smoke test user `admin@smoke.test` may not exist in the database (SQLite/PG).
- OR API is returning 401 and Frontend gets stuck/reloads Login.
**Plan:**
1.  **Verify DB Seed:** Check if `admin@smoke.test` exists.
2.  **Seed Data:** Create a `scripts/seed_smoke_user.js` to ensure this user exists before tests.
3.  **Debug Frontend 401:** Check `App.jsx` handling of auth failure.
**Validation:** `npm run smoke:ui` must pass the Login step.

### 2. 🟧 High: System Health & Deep Navigation
**Risk:** Once logged in, specific tabs (Reports, Charts) are known to crash ("Black Screen").
**Plan:**
1.  **Fix Login (Step 1).**
2.  **Re-run Smoke:** Allow it to reach "Reports V2" / "Dashboard".
3.  **Capture Crash:** Verify if it finds the "ChartsAll/suppliers" crash.
4.  **Fix Crash:** Patch the specific component causing the runtime error.

### 3. 🟨 Medium: Playwright Stability
**Risk:** Flaky tests on Windows.
**Plan:**
- Ensure `webServer` timeout is sufficient (done).
- Use `test.step` for granular reporting.

### 4. 🟩 Low: UX Polish
- Add loading indicators for heavy tabs.
- Fix console warnings (chunk size).

## Recommended Immediate Action
Proceed to **Fix Login/Bootstrap** by ensuring the smoke user exists.
Then re-run smokes to unblock the rest of the testing.
