# Backup & Freeze (V2.8.0)

This guide documents how to create a complete, consistent backup of the project state at version v2.8.0.

## 1. Git Snapshot
Ensure all changes are committed and tagged.

```bash
git status
git add .
git commit -m "chore: freeze v2.8.0 state"
git tag -a v2.8.0 -m "Release v2.8.0"
git push --follow-tags
```

## 2. Database Backup

### Option A: SQLite (Default)
Back up the `data` directory (or `server/data` if legacy).

**PowerShell:**
```powershell
# Copy 'data' or 'server/data'
Copy-Item -Path "data" -Destination "backups/v2.8.0_data" -Recurse
```

### Option B: Postgres
Use `pg_dump` via Docker Compose (Custom Format `-Fc` recommended).

**Backup:**
```bash
docker compose exec -T postgres pg_dump -Fc -U invoicestudio invoicestudio > backups/v2.8.0_dump.dump
```

**Restore Example:**
```bash
docker compose exec -T postgres pg_restore -U invoicestudio -d invoicestudio --clean < backups/v2.8.0_dump.dump
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
