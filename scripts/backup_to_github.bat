@echo off
echo Backing up localized Dev to GitHub Main...
robocopy "c:\Dev\InvoiceStudioGRVTY-local" "c:\Users\pedro\OneDrive\APPS\GitHub\InvoiceStudioGRVTY-main" /MIR /XD node_modules .git .vscode dist data artifacts /XF .env .DS_Store
if %ERRORLEVEL% LSS 8 echo Backup Complete (Success)
if %ERRORLEVEL% GEQ 8 echo Backup Failed (ErrorLevel %ERRORLEVEL%)
echo Done.
