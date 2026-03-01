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
    let config;
    if (typeof leadTime === 'object' && leadTime !== null) {
        config = {
            value: parseFloat(leadTime.value !== undefined ? leadTime.value : (leadTime.lead_time_weeks || 0)),
            unit: leadTime.unit || 'weeks'
        };
    } else {
        config = { value: parseFloat(leadTime || 0), unit: 'weeks' };
    }

    if (isNaN(config.value)) config.value = 0;

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

    // 3. Check for SHUTDOWNS in the range [Start, Target] - Iterative approach
    let processedShutdownIds = new Set();
    let foundNewShutdown = true;

    // Filter shutdowns for the iterative loop
    const recurringEvents = events.filter(e => e.type === 'shutdown' && e.is_recurring);
    const staticEvents = events.filter(e => e.type === 'shutdown' && !e.is_recurring);

    while (foundNewShutdown) {
        foundNewShutdown = false;

        const relevantShutdowns = [];
        const startYear = startDate.getFullYear();
        const targetYear = targetDate.getFullYear();

        recurringEvents.forEach(ev => {
            const evStart = new Date(ev.start_date);
            const evEnd = new Date(ev.end_date);
            for (let y = startYear; y <= targetYear + 1; y++) {
                relevantShutdowns.push({
                    id: `${ev.id}-${y}`,
                    start: new Date(y, evStart.getMonth(), evStart.getDate()),
                    end: new Date(y, evEnd.getMonth(), evEnd.getDate())
                });
            }
        });

        staticEvents.forEach(ev => {
            relevantShutdowns.push({ id: ev.id, start: new Date(ev.start_date), end: new Date(ev.end_date) });
        });

        relevantShutdowns.sort((a, b) => a.start - b.start);

        for (const shutdown of relevantShutdowns) {
            if (!processedShutdownIds.has(shutdown.id) && shutdown.start <= targetDate && shutdown.end >= startDate) {
                const diffTime = Math.abs(shutdown.end - shutdown.start);
                const shutdownDuration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                targetDate.setDate(targetDate.getDate() + shutdownDuration);
                processedShutdownIds.add(shutdown.id);
                foundNewShutdown = true;
                break; // Re-calculate starting from the earliest shutdown in the new range
            }
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

    const events = [
        {
            id: crypto.randomUUID(),
            calendar_id: calId,
            type: 'shutdown',
            start_date: '2000-08-05',
            end_date: '2000-08-26',
            description: 'Paragem de Verão (Nicolazzi)',
            is_recurring: true
        },
        {
            id: crypto.randomUUID(),
            calendar_id: calId,
            type: 'shutdown',
            start_date: '2000-12-23',
            end_date: '2000-12-31',
            description: 'Natal/Fim de Ano (Nicolazzi)',
            is_recurring: true
        },
        {
            id: crypto.randomUUID(),
            calendar_id: calId,
            type: 'shutdown',
            start_date: '2000-01-01',
            end_date: '2000-01-06',
            description: 'Ano Novo/Reis (Nicolazzi)',
            is_recurring: true
        }
    ];

    await knex('calendar_events').insert(events);
    console.log('[Logistics] Seeded default events.');
}

async function seedRitmonioCalendar() {
    const brandId = 'ritmonio';
    const exists = await knex('factory_calendars').where('brand_id', brandId).first();
    if (exists) return;

    console.log('[Logistics] Seeding Ritmonio Calendar (Italy)...');

    const calId = crypto.randomUUID();
    await knex('factory_calendars').insert({
        id: calId,
        name: 'Ritmonio Factory (Italy)',
        brand_id: brandId,
        country_code: 'IT'
    });

    // Standard Italian Holidays (Recurring)
    const holidays = [
        { date: '2000-01-01', desc: 'New Year' },
        { date: '2000-01-06', desc: 'Epiphany' },
        { date: '2000-04-25', desc: 'Liberation Day' },
        { date: '2000-05-01', desc: 'Labor Day' },
        { date: '2000-06-02', desc: 'Republic Day' },
        { date: '2000-08-15', desc: 'Ferragosto' },
        { date: '2000-11-01', desc: 'All Saints' },
        { date: '2000-12-08', desc: 'Immaculate Conception' },
        { date: '2000-12-25', desc: 'Christmas' },
        { date: '2000-12-26', desc: 'St. Stephen' }
    ];

    const events = holidays.map(h => ({
        id: crypto.randomUUID(),
        calendar_id: calId,
        type: 'shutdown',
        start_date: h.date,
        end_date: h.date,
        description: h.desc,
        is_recurring: true
    }));

    // Add traditional factory shutdowns
    // Summer: August (usually 2-3 weeks)
    events.push({
        id: crypto.randomUUID(),
        calendar_id: calId,
        type: 'shutdown',
        start_date: '2000-08-05',
        end_date: '2000-08-25',
        description: 'Paragem Verão (Ritmonio)',
        is_recurring: true
    });

    // Winter: Dec 24 - Jan 6
    events.push({
        id: crypto.randomUUID(),
        calendar_id: calId,
        type: 'shutdown',
        start_date: '2000-12-24',
        end_date: '2000-12-31',
        description: 'Paragem Natal (Parte 1)',
        is_recurring: true
    });
    events.push({
        id: crypto.randomUUID(),
        calendar_id: calId,
        type: 'shutdown',
        start_date: '2000-01-01',
        end_date: '2000-01-06',
        description: 'Paragem Janeiro (Parte 2)',
        is_recurring: true
    });

    await knex('calendar_events').insert(events);
    console.log('[Logistics] Ritmonio Calendar Seeded.');
}

module.exports = {
    calculateShipDate,
    seedNicolazziCalendar,
    seedRitmonioCalendar
};
