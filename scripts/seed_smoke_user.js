// scripts/seed_smoke_user.js
require('dotenv').config();
const path = require('path');

// Ensure we are pointing to the correct DB if not set
if (!process.env.DB_CLIENT && !process.env.DATABASE_URL) {
    console.warn('[Seed] No DB config found in env. Ensure this script is run with correct ENV.');
}

// Locate UserService. Assuming this script is in /scripts and server is in /server
const UserService = require('../server/src/services/UserService');
const knex = require('../server/src/db/knex');

const SMOKE_EMAIL = process.env.SMOKE_EMAIL || 'admin@smoke.test';
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || 'password123';

async function seed() {
    console.log(`[Seed] Checking for smoke user: ${SMOKE_EMAIL}...`);

    try {
        const existing = await UserService.findByEmail(SMOKE_EMAIL);

        if (existing) {
            console.log('[Seed] User already exists. Checking password/role not implemented to avoid destructive changes, assuming valid from previous seed.');
            // Ideally we could update password if needed, but for now we assume existence is enough.
            // If we really need to force update, we would need to update hash.
            // Let's verify role just in case? 
            // For now, simpler is better: if exists, we are good.
        } else {
            console.log('[Seed] User not found. Creating new Admin...');
            await UserService.createAdmin(
                SMOKE_EMAIL,
                SMOKE_PASSWORD,
                'Smoke Admin',
                'Smoke Org'
            );
            console.log('[Seed] User created successfully.');
        }

    } catch (err) {
        console.error('[Seed] Failed:', err);
        process.exit(1);
    } finally {
        await knex.destroy();
    }
}

seed();
