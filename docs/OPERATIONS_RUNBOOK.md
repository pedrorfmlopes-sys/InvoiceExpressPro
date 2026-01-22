# Operations Runbook

## 1. Local Environment Setup

### Prerequisites
- Node.js v18+
- NPM v9+
- SQLite (default) or PostgreSQL

### Required Environment Variables (.env)
Copy `.env.example` to `.env`. Critical variables:

| Variable | Description | Default / Example |
|----------|-------------|-------------------|
| `PORT` | Server Port | `3000` |
| `DB_CLIENT` | Database Driver | `sqlite3` (or `pg`) |
| `SQLITE_FILENAME` | SQLite File Path | `./db/database.sqlite` |
| `DATABASE_URL` | Postgres Connection | `postgres://user:pass@localhost:5432/db` |
| `AUTH_MODE` | Auth Strategy | `finance` (local) or `ad` (Active Directory) |
| `JWT_SECRET` | Token Secret | `change_me_in_prod` |
| `QA_MODE` | Enable Dev/QA Features | `true` (disable in PROD) |

### Start Commands
```bash
# Install dependencies
npm run install:all

# Run Migrations
npm run db:migrate

# Start Server + Client (Dev Mode)
# Runs both in parallel, with default env (SQLite)
npm run dev

# Start Server Only (Production Mode)
# Does NOT build client. Runs existing build.
npm start

# Build Client (Manual)
npm run build:client

# Kill Zombie Ports
# Use if you can't start due to EADDRINUSE
npm run kill:3000
npm run kill:5173
```

### Deploying from OneDrive (Windows)
If your repo is in `.../OneDrive/...`:
1. `npm run deploy` will auto-detect it.
2. It creates `C:\Dev\InvoiceStudioDeployWorkdir`.
3. It copies your code (mirrors) to there.
4. It runs `npm ci` and migrations THERE.
5. **Production runs from THERE**.
*Customization*: Set `WORKDIR_PATH` env var to change the destination.

## Startup Examples

### Local Development (Recommended)
This uses `scripts/run_dev_all.js` to ensure Env variables are set correctly:
```powershell
npm run dev
```

### Production (PM2)
Ensure you have built the client first (`npm run build:client`).
```bash
export NODE_ENV=production
export DB_CLIENT=sqlite
export SQLITE_FILENAME=./db/database.sqlite
export PM2_APP_NAME=invoicestudio
# "npm start" just runs "node server/src/index.js"
pm2 start npm --name "invoicestudio" -- start
```

## 2. Health & Monitoring

### Health Check Endpoint
`GET /api/health/modules`
Returns the status of all backend modules.

**Response Example:**
```json
{
  "ok": true,
  "timestamp": "2024-01-01T12:00:00Z",
  "runtime": { "node": "v18.x", "dbClient": "sqlite3", "authMode": "finance" },
  "modules": [
    { "name": "coreV2", "status": "up", "prefixes": ["/api/v2"], "closed": true, "strictRouting": true },
    { "name": "reports", "status": "up", "prefixes": ["/api/reports", "/api/v2/reports"], "closed": true }
  ]
}
```
**Interpretation:**
- `ok`: Global system healthy.
- `modules`: List of loaded modules. Check `status: "up"`.
- `runtime`: Verify if running in expected DB/Auth mode.

### Smoke Tests
Run these periodically or after deployment.
```bash
# Run all critical module smokes
node scripts/smoke_m1_docs.js
node scripts/smoke_m2_processing.js
# ... see DEPLOY_CHECKLIST.md for full list
```

## 3. Common Troubleshooting

### Database Issues
- **Problem**: `SQLITE_ERROR: no such table`
- **Fix**: Run `npm run db:migrate`. Ensure `SQLITE_FILENAME` points to a writable directory.
- **Problem**: Wrong DB selected.
- **Check**: Look at startup logs "Server running on port ... DB: sqlite3". Check `DB_CLIENT` env var.

### Authentication
- **Problem**: `403 Forbidden` on admin actions.
- **Fix**: Check `AUTH_MODE`. In `finance` mode, ensure user has 'admin' role in `users` table. In `ad` mode, check AD group mappings.
- **Tip**: Set `QA_MODE=true` to bypass detailed permission checks in some dev scenarios (use with caution).

### Port Conflicts
- **Problem**: `EADDRINUSE`
- **Fix**: Kill process on port 3000 or change `PORT` in `.env`.

## Quick Troubleshooting

### SQLite Path Errado
- **Sintoma**: Erro `SQLITE_ERROR: no such table` ou DB vazio.
- **Fix**: Verificar `SQLITE_FILENAME`. O script `deploy_runner.js` tenta auto-detetar em `db/`, mas em produção pode precisar de override explícito.

### PM2 Não Instalado / App Name Errado
- **Sintoma**: `deploy:dry` avisa "PM2_APP_NAME not set" ou comando `pm2` não encontrado.
- **Fix**: Instalar PM2 globalmente (`npm i -g pm2`) e definir `PM2_APP_NAME` nas env vars.

### AUTH_MODE Requerido
- **Sintoma**: Acesso não autorizado ou comportamento inseguro.
- **Fix**: Garantir `AUTH_MODE=required`. Se esquecido, o `gate:release` pode falhar em alguns testes que assumem auth.
