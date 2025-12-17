# Deployment Checklist

## 1. Pre-Deployment Gates (QA Env)

### Automated Gates (Recommended)
Use the unified gate scripts to run all checks in one go.

> [!WARNING]
> **OneDrive/Sync Folders**: Do NOT run `npm install` or `gate` inside a synced OneDrive folder directly. 
> The `deploy_runner` script will automatically switch to a safe workdir (e.g. `C:\Dev\Workdir`) to prevent EPERM errors. 
> **Always use `npm run deploy:dry` first.**

- [ ] **Release Candidate**: `npm run gate:release`
  - Runs Build + All Smoke Tests per module.
  - MUST PASS (Exit Code 0).

- [ ] **Pre-Commit / Quick Check**: `npm run gate:precommit`
  - Runs Build + Critical Smokes.

### Manual Verification (Fallback)
If gates fail, verify components individually:

- [ ] **Docs Module**: `node scripts/smoke_m1_docs.js`
- [ ] **Processing**: `node scripts/smoke_m2_processing.js`
- [ ] **Exports**: `node scripts/smoke_m3_exports.js`
- [ ] **Normalize**: `node scripts/smoke_m4_normalize.js`
- [ ] **Audit**: `node scripts/smoke_m5_audit.js`
- [ ] **Transactions**: `node scripts/smoke_m6_transactions.js`
- [ ] **Core V2**: `node scripts/smoke_m7_coreV2.js`
- [ ] **Reports Legacy**: `node scripts/smoke_m8_reports_legacy.js`
- [ ] **Reports V2**: `node scripts/smoke_m9_reports_v2.js`
- [ ] **General Health**: `node scripts/smoke_health.js`

### Frontend Build
- [ ] Run `npm run build:client` (Must have 0 errors).

## 2. Release Steps

### 1-Command Deploy (Preferred)

- **Dry Run** (Simulate): `npm run deploy:dry`
- **Dry Run** (Simulate): `npm run deploy:dry`
- **Full Deploy**: `npm run deploy`
  - *OneDrive-Safe*: Auto-copies to `C:\Dev\Workdir` if detected.
  - Runs Gates
  - Backups DB (SQLite)
  - Installs Deps
  - Runs Migrations
  - Restarts (if PM2_APP_NAME set)

### Manual Steps (Legacy)

1.  **Backup Database**:
    - SQLite: Copy `database.sqlite` to `backup/`.
    - Postgres: `pg_dump`.

2.  **Pull Code**:
    - `git pull origin main`

3.  **Install Deps**:
    - `npm ci --production`
    - `cd client && npm ci --production`

4.  **Backend Build/Migration**:
    - `npm run db:migrate`

5.  **Frontend Build**:
    - `cd client && npm run build`

6.  **Restart Services**:
    - `pm2 restart invoice-studio` (or equivalent)

### Env Vars Típicas (Exemplos)

| Variable | Exemplo | Descrição |
| :--- | :--- | :--- |
| `DB_CLIENT` | `sqlite` | Cliente de DB (sqlite ou pg) |
| `SQLITE_FILENAME` | `db/database.sqlite` | Caminho para o ficheiro SQLite |
| `PM2_APP_NAME` | `invoicestudio` | Nome do processo PM2 para restart automático |
| `PORT` | `3000` | Porta do servidor |
| `NODE_ENV` | `production` | Ambiente |
| `AUTH_MODE` | `required` | Modo de autenticação (obrigatório em prod) |

## 3. Verificação Pós-Deploy

1.  **System Health**:
    - Aceder a `/admin` -> Tab **🏥 System Health**.
    - Confirmar status **OK**.
2.  **API Health Checks**:
    - GET `/api/health/modules`
    - Check: `ok: true` e módulos `closed: true`.
3.  **Manual Gate (Opcional)**:
    - Correr `npm run gate:precommit` no servidor para validação extra.

## 4. Rollback Procedure

If Health Check fails or Smokes fail in Prov:

1.  **Revert Code**:
    - `git checkout <previous-tag>`

2.  **Restore Database** (If migrations ran and are destructive):
    - Restore from backup created in Step 1.
    - **NOTE**: Backward compatible migrations are preferred to avoid DB restore.

3.  **Restart Services**.

4.  **Verify Restoration**:
    - Run `smoke_health.js`.
