# PowerShell Backup Script for Invoice Studio
$version = "v2.8.0"
$timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$backupDir = "backups/$version_$timestamp"

# Create Backup Dir
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Write-Host "Created backup dir: $backupDir"

# 1. DB (SQLite) - Only copy if present
if (Test-Path "server/data/invoice.db") {
    Write-Host "Backing up SQLite DB..."
    Copy-Item "server/data/invoice.db" "$backupDir/invoice.db"
    Copy-Item "server/data/uploads" "$backupDir/uploads" -Recurse -ErrorAction SilentlyContinue
} else {
    Write-Host "SQLite DB not found (skipped)."
}

# 2. Project Zip (excluding node_modules)
$zipName = "$backupDir/project_source.zip"
Write-Host "Zipping project source (this may take a moment)..."

# Using Compress-Archive (might be slow for large folders, but standard)
# We select items manually to skip node_modules
$exclude = @("node_modules", ".git", "client/node_modules", "client/dist", "backups")
$items = Get-ChildItem -Path . -Exclude $exclude

Compress-Archive -Path $items -DestinationPath $zipName -Update

Write-Host "Backup Complete: $zipName"
