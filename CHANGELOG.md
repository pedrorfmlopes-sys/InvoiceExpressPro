# Changelog

## V2.7.0 (Current)
- **Added**: RBAC Enforced (Admin vs User).
- **Security**: Protected DocType configuration endpoints (`requireRole('admin')`).
- **Web**: UI now hides administrative tabs for non-admin users.
- **QA**: Idempotent RBAC smoke tests (`smoke_v2_7_rbac.js`) and robust Windows runner.

## V2.6
- **Added**: Session Refresh (HttpOnly Cookies).
- **Security**: JWT tokens now use robust refresh mechanism.
