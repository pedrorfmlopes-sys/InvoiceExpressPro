# Self-host Quickstart (Windows-first)

This guide helps you run Invoice Studio V2 on your local Windows machine (or server) with minimal friction.

## Prerequisites
1. **Node.js**: v18 LTS or v20 LTS recommended (v18+ required).
2. **Postgres** (Optional, recommended for Prod): Installed locally or via Docker.
   - Using Repo Docker (Compose): `docker compose up -d` (or `docker-compose up -d` for older versions). Starts Postgres 16 on port 5432.
   - Manual Docker: `docker run -d -p 5432:5432 -e POSTGRES_USER=invoicestudio -e POSTGRES_PASSWORD=mysecretpassword -e POSTGRES_DB=invoicestudio postgres:16`
3. **Git**: To clone the repo.

## Ports Reference
- **3000**: Main Server (API + Client Production Build)
- **5173**: Client Dev Server (Hot Module Reload)
- **5432**: Postgres Database

## Env Vars (Configuration)
Configure these before running (CMD or PowerShell).

### Mandatory
- `DB_CLIENT`: `pg` (or `sqlite`)
- `DATABASE_URL`: `postgres://invoicestudio:mysecretpassword@localhost:5432/invoicestudio`
- `AUTH_MODE`: `required` (Enforces Login)
- `JWT_SECRET`: `change_this_to_something_secure`

### Optional
- `OPENAI_API_KEY`: Activates AI Extraction. Model is defined in code/config.
- `PORT`: Server port (default 3000).

### Verification
Run robust smoke tests with bundled runner:
```bash
# SQLite (Auth)
npm run smoke:v2_6:sqlite

# Postgres (Auth) - Requires DB running
# Ensure env vars are set (DB_CLIENT=pg, DATABASE_URL=...)
npm run smoke:v2_6:pg
```
- `PORT`: Default 3000

#### Examples

**PowerShell**
```powershell
$env:DB_CLIENT="pg"
$env:DATABASE_URL="postgres://invoicestudio:mysecretpassword@localhost:5432/invoicestudio"
$env:AUTH_MODE="required"
$env:JWT_SECRET="super_secret"
```

**CMD**
```cmd
set DB_CLIENT=pg
set DATABASE_URL=postgres://invoicestudio:mysecretpassword@localhost:5432/invoicestudio
set AUTH_MODE=required
set JWT_SECRET=super_secret
```

## Quick Start (SQLite - Simplest)
Good for testing, dev, or small usage.

1. **Install Dependencies**
   ```powershell
   npm install
   # Installs server + client deps
   ```

2. **Initialize DB & Start**
   ```powershell
   npm run db:migrate
   npm start
   # npm start will build the client and serve it at localhost:3000
   ```

3. **Verify**
   - Open `http://localhost:3000`.

## Production / Power User (Postgres + Auth)

1. **Start Postgres**
   - Ensure specific DB exists: `invoicestudio` (Created automatically if using `docker-compose`)
   
2. **Use Helper Script (Windows)**
   We provide a script to set Env Vars, Migrate, and Start in one go.

   ```powershell
   .\scripts\windows\start_pg.cmd
   ```

   *Check the script to ensure credentials match your Postgres setup.*

3. **Run Smoke Test (Verify)**
   To ensure everything is working correctly with Postgres:

   ```powershell
   .\scripts\windows\run_smoke_pg.cmd
   ```

## Troubleshooting

- **Port 3000 Busy?**
  - Find PID: `netstat -ano | findstr :3000`
  - Kill: `taskkill /PID <PID> /F`

- **Port 5432 Busy?**
  - Usually another PG instance. Use that one or stop it.

- **Login Failed?**
  - If `AUTH_MODE=required` and you have no user, use `/api/auth/bootstrap` (Postman/Curl) or check `scripts/smoke...` to see how it bootstraps.
