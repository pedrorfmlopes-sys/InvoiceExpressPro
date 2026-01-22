const Service = require('./service');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Ensure correct path relative to root
const STORAGE_ROOT = path.join(process.cwd(), 'data', 'assets');
if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

exports.uploadAsset = async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        const buffer = file.buffer;

        // 1. Calculate Hash
        const hashSum = crypto.createHash('sha256');
        hashSum.update(buffer);
        const sha256 = hashSum.digest('hex');

        // 2. Dedup Check
        const existing = await Service.findByHash(sha256);
        if (existing) {
            // Dedup ON: reuse
            return res.json({
                id: existing.id,
                url: `/api/assets/${existing.id}`,
                mime_type: existing.mime_type,
                size_bytes: existing.size_bytes,
                deduplicated: true
            });
        }

        // 3. SVG Security Scan
        if (file.mimetype === 'image/svg+xml') {
            const str = buffer.toString('utf8').toLowerCase();
            if (str.includes('<script') || str.includes('javascript:') || str.includes('foreignobject') || str.includes('onload')) {
                return res.status(400).json({ error: 'SVG contains unsafe content' });
            }
        }

        // 4. Prepare Storage
        const id = uuidv4();
        // Ext from original name
        const ext = path.extname(file.originalname).substring(1).toLowerCase() || 'bin';
        const filename = `${id}.${ext}`;
        const storagePath = path.join(STORAGE_ROOT, filename);

        // 5. Save File
        await fs.promises.writeFile(storagePath, buffer);

        // 6. DB Insert
        try {
            const asset = await Service.create({
                id,
                kind: req.body.kind || 'icon',
                mime_type: file.mimetype,
                ext,
                size_bytes: file.size,
                sha256,
                original_filename: file.originalname,
                storage_path: filename,
                created_by: req.ctx?.user?.id || 'system'
            });

            res.json({
                id: asset.id,
                url: `/api/assets/${asset.id}`,
                mime_type: asset.mime_type,
                size_bytes: asset.size_bytes
            });
        } catch (e) {
            // Rollback file
            await fs.promises.unlink(storagePath).catch(() => { });
            throw e;
        }

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
};

exports.getAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const asset = await Service.findById(id);
        if (!asset) return res.status(404).json({ error: 'Asset not found' });

        const filePath = path.join(STORAGE_ROOT, asset.storage_path);

        // Cache Headers
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('Content-Type', asset.mime_type);

        // Stream
        const stream = fs.createReadStream(filePath);
        stream.on('error', (err) => {
            if (err.code === 'ENOENT') res.status(404).json({ error: 'File missing on disk' });
            else res.status(500).end();
        });
        stream.pipe(res);

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getMeta = async (req, res) => {
    try {
        const { id } = req.params;
        const asset = await Service.findById(id);
        if (!asset) return res.status(404).json({ error: 'Asset not found' });
        res.json(asset);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.listAssets = async (req, res) => {
    try {
        const { kind } = req.query;
        const assets = await Service.list(kind);
        const results = assets.map(a => ({
            ...a,
            url: `/api/assets/${a.id}`
        }));
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.deleteAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const asset = await Service.findById(id);
        if (!asset) return res.status(404).json({ error: 'Asset not found' });

        // 1. Delete from FS
        const filePath = path.join(STORAGE_ROOT, asset.storage_path);
        await fs.promises.unlink(filePath).catch(err => {
            console.warn(`Failed to delete file ${filePath}: ${err.message}`);
        });

        // 2. Delete from DB
        await Service.delete(id);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
