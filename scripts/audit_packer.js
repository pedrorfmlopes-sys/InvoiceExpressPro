const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const OUTPUT_ZIP = 'PROJECT_DUMP_SANITIZED.zip';
const output = fs.createWriteStream(path.join(__dirname, '..', OUTPUT_ZIP));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', function () {
    console.log('ZIP Created: ' + OUTPUT_ZIP);
    console.log('Size: ' + archive.pointer() + ' total bytes');
});

archive.on('error', function (err) {
    throw err;
});

archive.pipe(output);

// Files to Include (Root)
const includeFiles = [
    'package.json',
    'package-lock.json',
    'README.md',
    'INVENTORY_TREE.txt',
    'ROUTES_MAP.md',
    'FRONTEND_WIRING_MAP.md',
    'DATA_MODEL_MAP.md',
    'ENV_REQUIRED.md',
    'DEAD_CODE_HINTS.md',
    'REPORT_V2.md',
    '.env.example',
    '.gitignore'
];

includeFiles.forEach(f => {
    if (fs.existsSync(path.join(__dirname, '..', f))) {
        archive.file(path.join(__dirname, '..', f), { name: f });
    }
});

// Directories to Include (with filters)
function addDir(dir) {
    const fullPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(fullPath)) return;

    archive.directory(fullPath, dir, (entry) => {
        // Exclusions inside directories
        if (entry.name.includes('node_modules')) return false;
        if (entry.name.endsWith('.sqlite')) return false;
        if (entry.name.endsWith('.db')) return false;
        if (entry.name.endsWith('.log')) return false;
        if (entry.name.startsWith('.git')) return false;
        if (entry.name.includes('.cache')) return false;
        if (entry.name.includes('dist')) return false;
        if (entry.name.includes('build')) return false;
        if (entry.name.includes('uploads') && !entry.name.endsWith('.gitkeep')) return false; // Skip uploads content
        return entry;
    });
}

addDir('server');
addDir('client');
addDir('scripts');
addDir('docs');
addDir('config');

// Finalize
archive.finalize();
