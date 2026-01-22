const service = require('./service');
const fs = require('fs');

class ExtractionController {

    async list(req, res) {
        try {
            const profiles = await service.listProfiles();
            res.json(profiles);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }

    async get(req, res) {
        try {
            const profile = await service.getProfile(req.params.id);
            if (!profile) return res.status(404).json({ error: "Profile not found" });
            res.json(profile);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }

    async create(req, res) {
        try {
            const profile = await service.createProfile({ ...req.body, created_by: req.user ? req.user.username : 'system' });
            res.status(201).json(profile);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }

    async update(req, res) {
        try {
            const profile = await service.updateProfile(req.params.id, req.body);
            res.json(profile);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }

    async delete(req, res) {
        try {
            await service.deleteProfile(req.params.id);
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }

    async match(req, res) {
        try {
            if (!req.file) return res.status(400).json({ error: "No file uploaded" });
            const buffer = fs.readFileSync(req.file.path);
            const result = await service.matchProfile(buffer);
            // Cleanup
            fs.unlinkSync(req.file.path);
            res.json(result);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }

    // Test endpoint to verify extraction logic
    async testExtraction(req, res) {
        try {
            if (!req.file) return res.status(400).json({ error: "No file uploaded" });
            if (!req.body.profileId) return res.status(400).json({ error: "No profileId" });

            const buffer = fs.readFileSync(req.file.path);
            const result = await service.extractWithProfile(buffer, req.body.profileId);

            fs.unlinkSync(req.file.path);
            res.json(result);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new ExtractionController();
