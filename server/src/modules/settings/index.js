const express = require('express');
const router = express.Router();
const SettingsService = require('./service');

router.get('/doctypes', async (req, res) => {
    try {
        const types = await SettingsService.getDocTypes(req.project);
        res.json(types);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/doctypes', async (req, res) => {
    try {
        const { label } = req.body;
        if (!label) return res.status(400).json({ error: 'Label required' });
        const type = await SettingsService.createDocType(req.project, label);
        res.json(type);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = { router };
