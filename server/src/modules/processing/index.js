const router = require('./routes');
module.exports = {
    router,
    meta: {
        name: 'processing',
        prefixes: ['/api'], // /extract, /progress, /batch
        closed: true,
        strictRouting: false
    }
};
