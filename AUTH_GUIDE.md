AUTH GUIDE
==========

Default Mode: AUTH_MODE=optional
--------------------------------
In this mode, the system works like a local app. No login required.
Context is auto-filled as "Local Admin" (Plan: Pro).

Enabling SaaS Mode: AUTH_MODE=required
--------------------------------------
Set env var `AUTH_MODE=required` on start.
All endpoints (except /auth/* and /health) will return 401 if no valid Bearer token provided.

Bootstrap Flow (First Run)
--------------------------
If DB is clean (no users):
POST /api/auth/bootstrap
{
  "email": "admin@example.com",
  "password": "strongpassword",
  "name": "Admin",
  "orgName": "My Company"
}
Response: { token, ... }

Login Flow
----------
POST /api/auth/login
{
  "email": "admin@example.com",
  "password": "strongpassword"
}
Response: { token, ... }

Using the Token
---------------
Add header: `Authorization: Bearer <token>`
Call `GET /api/auth/me` to verify.
