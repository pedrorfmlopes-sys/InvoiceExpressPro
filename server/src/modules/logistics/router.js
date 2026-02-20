// server/src/modules/logistics/router.js
const express = require('express');
const router = express.Router();
const knex = require('../../db/knex');
const crypto = require('crypto');

// Helper: get or create a factory_calendar record for a brand
async function getOrCreateCalendar(brandId) {
    let cal = await knex('factory_calendars').where({ brand_id: brandId }).first();
    if (!cal) {
        const id = crypto.randomUUID();
        await knex('factory_calendars').insert({
            id,
            brand_id: brandId,
            name: brandId,
            created_at: Date.now(),
            updated_at: Date.now()
        });
        cal = await knex('factory_calendars').where({ id }).first();
    }
    return cal;
}

// GET /api/logistics/calendar/:brandId/events
router.get('/calendar/:brandId/events', async (req, res) => {
    try {
        const { brandId } = req.params;
        const cal = await getOrCreateCalendar(brandId);
        const events = await knex('calendar_events')
            .where({ calendar_id: cal.id })
            .orderBy('start_date', 'asc');
        res.json(events);
    } catch (err) {
        console.error('[Logistics] GET events error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/logistics/calendar/:brandId/events
router.post('/calendar/:brandId/events', async (req, res) => {
    try {
        const { brandId } = req.params;
        const { description, start_date, end_date, is_recurring } = req.body;

        if (!description || !start_date || !end_date) {
            return res.status(400).json({ error: 'description, start_date and end_date are required' });
        }

        const cal = await getOrCreateCalendar(brandId);
        const id = crypto.randomUUID();

        await knex('calendar_events').insert({
            id,
            calendar_id: cal.id,
            type: 'shutdown',
            description,
            start_date,
            end_date,
            is_recurring: is_recurring ? 1 : 0,
            created_at: Date.now(),
            updated_at: Date.now()
        });

        const created = await knex('calendar_events').where({ id }).first();
        res.status(201).json(created);
    } catch (err) {
        console.error('[Logistics] POST event error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/logistics/calendar/events/:eventId
router.delete('/calendar/events/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const deleted = await knex('calendar_events').where({ id: eventId }).del();
        if (!deleted) return res.status(404).json({ error: 'Event not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('[Logistics] DELETE event error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
