# Backup & Freeze (V2.8.0)

This guide documents how to create a complete, consistent backup of the project state at version v2.8.0.

## 1. Git Snapshot
Ensure all changes are committed and tagged.

```bash
git status
git add .
git commit -m "chore: freeze v2.8.0 state"
git tag -a v2.8.0 -m "Release v2.8.0"
git push origin master --tags
```

## 2. Database Backup

### Option A: SQLite (Default)
Copy the `server/data` directory. This contains the SQLite database file and uploads.

**PowerShell:**
```powershell
Copy-Item -Path "server/data" -Destination "backups/v2.8.0_data" -Recurse
```

### Option B: Postgres
Use `pg_dump` to create an SQL dump. If running via Docker:

```bash
docker exec -t <container_name> pg_dump -U invoicestudio invoicestudio > backups/v2.8.0_dump.sql
```

## 3. Project Archive (ZIP)
To create a portable archive excluding `node_modules`.

**PowerShell Helper Script:**
We provide `scripts/backup_snapshot.ps1` to automate this. It uses an **allowlist** to include only source code and clean config files, ensuring a lightweight and clean backup (no `node_modules` or build artifacts).

```powershell
.\scripts\backup_snapshot.ps1
```

**Manual:**
Use 7-Zip or standard Zip tools to compress the root folder, explicitly including:
- `client/src`, `client/public`
- `server/src`
- `scripts`, `docs`
- Root config files (`package.json`, `README.md`, etc.)

Excluding:
- `node_modules`
- `dist` / `build` folders
- `.git`
