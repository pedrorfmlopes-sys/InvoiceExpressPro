const path = require('path');
const fs = require('fs');
const knex = require('knex');

/**
 * SatelliteStorage
 * Manages independent SQLite databases for each extractor/brand.
 * Follows 1:1:1:1 architecture (1 Doc : 1 Extractor : 1 DB : 1 Viewer).
 */
class SatelliteStorage {
    constructor() {
        this.basePath = path.resolve(__dirname, '../../../data/extractors');
        this.connections = new Map();

        if (!fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, { recursive: true });
        }
    }

    /**
     * Get or create a knex connection for a specific satellite DB.
     * @param {string} satelliteName - Name of the satellite (e.g., 'nicolazzi_proformas')
     */
    getConnection(satelliteName) {
        if (!satelliteName) throw new Error('Satellite name is required');
        const safeName = satelliteName.replace(/[^a-z0-9_]/gi, '').toLowerCase();

        if (this.connections.has(safeName)) {
            return this.connections.get(safeName);
        }

        const dbPath = path.join(this.basePath, `${safeName}.sqlite`);

        const db = knex({
            client: 'sqlite3',
            connection: { filename: dbPath },
            useNullAsDefault: true,
            pool: {
                afterCreate: (conn, cb) => conn.run('PRAGMA foreign_keys = ON', cb)
            }
        });

        this.connections.set(safeName, db);
        return db;
    }

    /**
     * Ensures the standard 'extractions' table exists in the satellite.
     * @param {string} satelliteName 
     */
    async ensureSchema(satelliteName) {
        const db = this.getConnection(satelliteName);
        const hasTable = await db.schema.hasTable('extractions');
        if (!hasTable) {
            await db.schema.createTable('extractions', (t) => {
                t.string('docId').primary(); // Reference to central db.sqlite 'documents.id'
                t.text('dataJson');          // The full extraction payload
                t.timestamp('createdAt').defaultTo(db.fn.now());
                t.timestamp('updatedAt').defaultTo(db.fn.now());
            });
            console.log(`[Satellite] Created 'extractions' table in ${satelliteName}.sqlite`);
        }
    }

    /**
     * Saves high-fidelity data to a satellite DB.
     * @param {string} satelliteName 
     * @param {string} docId 
     * @param {object} data 
     */
    async saveData(satelliteName, docId, data) {
        if (!docId) throw new Error('docId is required for satellite save');
        await this.ensureSchema(satelliteName);
        const db = this.getConnection(satelliteName);

        const payload = {
            docId,
            dataJson: JSON.stringify(data),
            updatedAt: new Date()
        };

        const exists = await db('extractions').where({ docId }).first();
        if (exists) {
            await db('extractions').where({ docId }).update(payload);
        } else {
            payload.createdAt = new Date();
            await db('extractions').insert(payload);
        }
    }

    /**
     * Retrieves data from a satellite DB.
     * @param {string} satelliteName 
     * @param {string} docId 
     */
    async getData(satelliteName, docId) {
        const db = this.getConnection(satelliteName);
        const hasTable = await db.schema.hasTable('extractions');
        if (!hasTable) return null;

        const row = await db('extractions').where({ docId }).first();
        if (!row) return null;

        return JSON.parse(row.dataJson);
    }

    /**
     * Deletes data from a satellite DB.
     * @param {string} satelliteName 
     * @param {string} docId 
     */
    async deleteData(satelliteName, docId) {
        const db = this.getConnection(satelliteName);
        const hasTable = await db.schema.hasTable('extractions');
        if (!hasTable) return;

        await db('extractions').where({ docId }).del();
    }
}

module.exports = new SatelliteStorage();
