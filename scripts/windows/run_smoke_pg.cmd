@echo off
echo [InvoiceStudio] Running Smoke Test (PG)...

set DB_CLIENT=pg
set DATABASE_URL=postgres://postgres:password@localhost:5432/invoicestudio
set AUTH_MODE=required

echo [InvoiceStudio] Running V2.6 Smoke: Postgres + Auth (Refresh)
call npm run smoke:v2_6:pg
pause
