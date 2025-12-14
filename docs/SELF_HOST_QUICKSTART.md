# Self-host Quickstart (Windows-first)

This guide helps you run Invoice Studio V2 on your local Windows machine (or server) with minimal friction.

## Prerequisites
1. **Node.js**: v18+ installed.
2. **Postgres** (Optional, recommended for Prod): Installed locally or via Docker.
   - If using Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=invoicestudio postgres:15-alpine`
3. **Git**: To clone the repo.

## Quick Start (SQLite - Simplest)
Good for testing, dev, or small usage.

1. **Install Dependencies**
   ```powershell
   npm install
   cd client; npm install; cd ..
   ```

2. **Initialize DB**
   ```powershell
   npm run db:migrate
   ```

3. **Start**
   ```powershell
   # Cmd 1 (Server)
   npm start
   # Cmd 2 (Client)
   npm run build:client
   # Or dev mode: cd client; npm run dev
   ```

4. **Verify**
   - Open `http://localhost:3000` (Server/API) or `http://localhost:5173` (Client Dev).

## Production / Power User (Postgres + Auth)

1. **Start Postgres**
   - Ensure specific DB exists: `invoicestudio`
   
2. **Use Helper Script (Windows)**
   We provide a script to set Env Vars, Migrate, and Start in one go.

   ```powershell
   .\scripts\windows\start_pg.cmd
   ```

   *Check the script to adjust password/user if needed.*

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
