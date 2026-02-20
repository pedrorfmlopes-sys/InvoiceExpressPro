const knex = require('../../db/knex');
const crypto = require('crypto');

/**
 * @param {Date} startDate - Order Confirmation Date
 * @param {number|object} leadTime - Weeks as number, or { value, unit: 'weeks'|'months'|'days' }
 * @param {string} brandId - 'nicolazzi' or other to fetch calendar
 */
async function calculateShipDate(startDate, leadTime, brandId = 'nicolazzi') {
    if (!startDate) return null;

    // Normalize leadTime to { value, unit }
    let config = typeof leadTime === 'object' ? leadTime : { value: leadTime || 0, unit: 'weeks' };

    // 1. Fetch Calendar Logic
    const calendar = await knex('factory_calendars').where('brand_id', brandId).first();
    let events = [];
    if (calendar) {
        events = await knex('calendar_events').where('calendar_id', calendar.id);
    }

    let targetDate = new Date(startDate);

    // 2. Base Lead Time Application
    if (config.unit === 'weeks') {
        targetDate.setDate(targetDate.getDate() + (config.value * 7));
    } else if (config.unit === 'months') {
        targetDate.setMonth(targetDate.getMonth() + config.value);
    } else if (config.unit === 'days') {
        // Business Days logic: Add days one by one skipping weekends
        let daysAdded = 0;
        while (daysAdded < config.value) {
            targetDate.setDate(targetDate.getDate() + 1);
            if (targetDate.getDay() !== 0 && targetDate.getDay() !== 6) {
                daysAdded++;
            }
        }
    }

    // 3. Check for SHUTDOWNS in the range [Start, Target]
    let relevantShutdowns = [];
    const recurringEvents = events.filter(e => e.type === 'shutdown' && e.is_recurring);
    const staticEvents = events.filter(e => e.type === 'shutdown' && !e.is_recurring);

    const startYear = startDate.getFullYear();
    const targetYear = targetDate.getFullYear();

    // Expand recurring events for current and next year
    recurringEvents.forEach(ev => {
        const evStart = new Date(ev.start_date);
        const evEnd = new Date(ev.end_date);
        for (let y = startYear; y <= targetYear + 1; y++) {
            relevantShutdowns.push({
                start: new Date(y, evStart.getMonth(), evStart.getDate()),
                end: new Date(y, evEnd.getMonth(), evEnd.getDate())
            });
        }
    });

    staticEvents.forEach(ev => {
        relevantShutdowns.push({ start: new Date(ev.start_date), end: new Date(ev.end_date) });
    });

    relevantShutdowns.sort((a, b) => a.start - b.start);

    // Extend targetDate by any shutdown overlapping the range
    // We do a simple additive logic: if a shutdown is in the middle, push delivery out.
    for (const shutdown of relevantShutdowns) {
        if (shutdown.start < targetDate && shutdown.end > startDate) {
            const overlapStart = shutdown.start < startDate ? startDate : shutdown.start;
            const overlapEnd = shutdown.end > targetDate ? targetDate : shutdown.end;

            // For factory shutdowns, we usually add the FULL duration of the stop
            // Manufacturer logic: "If we stop for 2 weeks in August, delivery is pushed 2 weeks"
            const shutdownDuration = (shutdown.end - shutdown.start) / (1000 * 60 * 60 * 24);
            targetDate.setDate(targetDate.getDate() + Math.ceil(shutdownDuration));
        }
    }

    // 4. Final Adjustment: Skip Weekends/Holidays for the delivery day
    while (targetDate.getDay() === 0 || targetDate.getDay() === 6) { // 0=Sun, 6=Sat
        targetDate.setDate(targetDate.getDate() + 1);
    }

    return targetDate;
}

/**
 * Creates the default Nicolazzi Calendar if not exists.
 */
async function seedNicolazziCalendar() {
    const brandId = 'nicolazzi';
    const exists = await knex('factory_calendars').where('brand_id', brandId).first();
    if (exists) return;

    console.log('[Logistics] Seeding Nicolazzi Calendar...');

    const calId = crypto.randomUUID();
    await knex('factory_calendars').insert({
        id: calId,
        name: 'Nicolazzi Factory (Italy)',
        brand_id: brandId,
        country_code: 'IT'
    });

    // Standard Holidays/Shutdowns
    // August Shutdown (Ferragosto + Weeks): usually 3-4 weeks in August.
    // e.g., Aug 5th to Aug 26th (Recurring)
    // Christmas: Dec 23 to Jan 6

    const events = [
        {
            id: crypto.randomUUID(),
            calendar_id: calId,
            type: 'shutdown',
            start_date: '2000-08-01', // Year 2000 as base for recurring
            end_date: '2000-08-31',   // Whole August for safety/padding test
            description: 'Férias de Verão / Ferragosto (Paragem Fabril)',
            is_recurring: true
        },
        {
            id: crypto.randomUUID(),
            calendar_id: calId,
            type: 'shutdown',
            start_date: '2000-12-23',
            end_date: '2000-01-06',   // Spans years - complexity! Handled by logic? 
            // Better to split year-end: Dec 23-31 and Jan 1-6
            description: 'Natal / Fim de Ano',
            is_recurring: true
        }
    ];

    // Helper to fix the end-of-year recurring issue: split it
    const xmas1 = {
        id: crypto.randomUUID(),
        calendar_id: calId,
        type: 'shutdown',
        start_date: '2000-12-23',
        end_date: '2000-12-31',
        description: 'Natal (Parte 1)',
        is_recurring: true
    };
    const xmas2 = {
        id: crypto.randomUUID(),
        calendar_id: calId,
        type: 'shutdown',
        start_date: '2000-01-01',
        end_date: '2000-01-07',
        description: 'Ano Novo / Epifania (Parte 2)',
        is_recurring: true
    };

    await knex('calendar_events').insert([events[0], xmas1, xmas2]);
    console.log('[Logistics] Seeded default events.');
}

module.exports = {
    calculateShipDate,
    seedNicolazziCalendar
};
