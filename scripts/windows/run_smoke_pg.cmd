@echo off
echo [InvoiceStudio] Running Smoke Test (PG)...

set DB_CLIENT=pg
set DATABASE_URL=postgres://postgres:password@localhost:5432/invoicestudio
set AUTH_MODE=required

node scripts/smoke_v2_4_pg.js
pause
