const knex = require('./server/src/db/knex');

async function getDocDetails() {
    try {
        const row = await knex('documents')
            .where('id', '3950c77e-65f9-47a3-ab03-c87b8e335c8f')
            .first();

        console.log(JSON.stringify(row, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

getDocDetails();
