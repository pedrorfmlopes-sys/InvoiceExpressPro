# InvoiceStudio archive viewer

Read-only viewer for the preserved legacy InvoiceStudio data. This standalone service never starts the legacy application's migrations, seeders or background tasks. Only `archive-viewer/` is built.

The PostgreSQL login is restricted to SELECT on business tables and archived file blobs. Authentication uses a salted scrypt hash and signed eight-hour HttpOnly cookies. Production requires HTTPS (Secure cookies). Database TLS verifies the Supabase certificate authority. Anonymous requests cannot access records or files.

Environment: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, ARCHIVE_PASSWORD_HASH (salt:hex scrypt output), SESSION_SECRET, NODE_ENV=production, PORT=10000. Secrets belong in Render environment variables, never Git. The project reference is deliberately pinned to the free archive project.

Build locally: `docker build -t invoice-archive-viewer .`. Deploy with Dockerfile `archive-viewer/Dockerfile`, context `archive-viewer`, plan Free, auto-deploy disabled, health check `/health`.

No persistent disk is required. The full 240-file archive lives in the private `invoice_archive_files` schema of Supabase. Projects are listed from the archived document records. Use the table selector for proposals, customers, catalogues and other business records; expand long fields to inspect their preserved content.

Validation: authentication and logout; anonymous access denied; business record counts; PDF SHA-256 matches backup; invalid table selection rejected; mutating HTTP methods rejected; database role lacks INSERT/UPDATE/DELETE and cannot read users.

The original paid services and InvoiceStudioClean are independent and are not modified by this deployment. Free services can sleep or pause; local encrypted backups remain necessary. This is an archive snapshot, not a live synchronisation.
