const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const OUTPUT_ZIP = 'PROJECT_SNAPSHOT_PRE_ENGINE.zip';
const output = fs.createWriteStream(path.join(__dirname, '..', OUTPUT_ZIP));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', function () {
    console.log('ZIP Created: ' + OUTPUT_ZIP);
    console.log('Size: ' + archive.pointer() + ' bytes');
});

archive.on('error', function (err) {
    throw err;
});

archive.pipe(output);

const ROOT = path.join(__dirname, '..');

// Add all files in root except excluded
fs.readdirSync(ROOT).forEach(file => {
    const fullPath = path.join(ROOT, file);
    const stat = fs.statSync(fullPath);

    // Global Exclusions
    if (file === 'node_modules') return;
    if (file === '.git') return;
    if (file === '.env') return; // SECRET
    if (file.endsWith('.pem') || file.endsWith('.key')) return;
    if (file.endsWith('.sqlite') || file.endsWith('.db')) return;
    if (file.startsWith('credentials') || file.startsWith('secrets')) return;

    // Directory Exclusions
    if (['dist', 'build', '.next', '.vite', 'out', '.cache'].includes(file)) return;
    if (['uploads', 'staging', 'exports', 'tmp'].includes(file)) return;

    // Output zip itself
    if (file === OUTPUT_ZIP) return;

    if (stat.isDirectory()) {
        archive.directory(fullPath, file, (entry) => {
            const name = entry.name.replace(/\\/g, '/');

            // Recursive exclusions
            if (name.includes('node_modules')) return false;

            // Exclude dist folders anywhere
            if (name.split('/').includes('dist')) return false;

            // Exclude secrets files anywhere
            if (name.endsWith('secrets.json')) return false;
            return entry;
        });
    } else {
        archive.file(fullPath, { name: file });
    }
});

archive.finalize();
