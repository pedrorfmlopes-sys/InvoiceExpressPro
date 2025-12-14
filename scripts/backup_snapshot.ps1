# PowerShell Backup Script for Invoice Studio (Robust)
$version = "v2.8.0"
$timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$backupRoot = "backups"
$backupDir = "$backupRoot/${version}_$timestamp"

# 1. Prepare Directory
if (-not (Test-Path $backupRoot)) { New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null }
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Write-Host "Created backup dir: $backupDir" -ForegroundColor Cyan

# 2. Data Backup (Robust detection)
# Priority: data/ -> server/data/
$dataSrc = ""
if (Test-Path "data") {
    $dataSrc = "data"
}
elseif (Test-Path "server/data") {
    $dataSrc = "server/data"
}

if ($dataSrc -ne "") {
    $destData = "$backupDir/data_backup"
    Write-Host "Backing up data from [$dataSrc] to [$destData]..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $destData | Out-Null
    Copy-Item -Path "$dataSrc/*" -Destination $destData -Recurse -Force
}
else {
    Write-Host "No 'data/' or 'server/data/' folder found. Skipping DB backup." -ForegroundColor Gray
}

# 3. Clean Zip (Allowlist approach)
$zipName = "$backupDir/project_source.zip"
if (Test-Path $zipName) { Remove-Item $zipName -Force }

Write-Host "Zipping project source (allowlist)..." -ForegroundColor Cyan

# Define Allowlist (Relative paths)
$allowlist = @(
    "client/src", 
    "client/public", 
    "client/index.html",
    "client/package.json", 
    "client/vite.config.*", 
    "client/tsconfig*.json",
    "server/src", 
    "server/package.json",
    "server/server.js",
    "scripts", 
    "docs", 
    "package.json", 
    "package-lock.json", 
    "pnpm-lock.yaml",
    "yarn.lock",
    "docker-compose.yml", 
    "README.md", 
    ".env.example",
    "knexfile.js"
)

# Collect files
$filesToZip = @()
foreach ($pattern in $allowlist) {
    # Resolve specific paths and wildcards (PS 5.1 compatible)
    $foundItems = $null
    
    # Check if path (or wildcard) exists
    if (Test-Path $pattern) {
        $foundItems = Get-Item $pattern
    }
    
    if ($foundItems) {
        $filesToZip += $foundItems
    }
}

# Compress
if ($filesToZip.Count -gt 0) {
    Compress-Archive -Path $filesToZip -DestinationPath $zipName -CompressionLevel Optimal
    
    # 4. Report
    $zipItem = Get-Item $zipName
    $sizeMb = [math]::Round($zipItem.Length / 1MB, 2)
    
    Write-Host "`n----------------------------------------" -ForegroundColor Green
    Write-Host "Backup Complete!" -ForegroundColor Green
    Write-Host " - Snapshot: $backupDir"
    Write-Host " - Zip Size: $sizeMb MB"
    Write-Host "----------------------------------------"
}
else {
    Write-Host "Error: No files found to zip!" -ForegroundColor Red
}
