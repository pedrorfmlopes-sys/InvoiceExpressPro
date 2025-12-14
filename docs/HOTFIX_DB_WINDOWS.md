HOTFIX: DB SELECTION FOR WINDOWS & ONEDRIVE
===========================================

Problem:
1. `node server/src/db/migrate.js` incorrectly defaulted to Postgres logic or locked files on OneDrive.
2. SQLite file path could not be overridden to avoid OneDrive syncing issues.

Changes:
1. **Robust Selection (`knex.js`)**: 
   - Strict check of `DB_CLIENT` (`pg`, `sqlite`).
   - If `sqlite`, forcing `client: 'sqlite3'`.
2. **SQLite Override**:
   - `SQLITE_FILENAME` env var can now point to an external path (e.g. `C:\temp\db.sqlite`).
3. **Scripts**:
   - `npm run db:migrate` -> Runs migrations.
   - `npm run db:import` -> Imports JSON data.

Usage (CMD):
```cmd
set DB_CLIENT=sqlite
set SQLITE_FILENAME=C:\temp\invoice-studio.sqlite
npm run db:migrate
npm start
```
