@echo off
echo [InvoiceStudio] Starting with Postgres (V2.6)...

set DB_CLIENT=pg
set DATABASE_URL=postgres://postgres:password@localhost:5432/invoicestudio
set AUTH_MODE=required
set JWT_SECRET=change_me_in_prod

echo [1/2] Migrating DB...
call npm run db:migrate

echo [2/2] Starting Server...
npm start
