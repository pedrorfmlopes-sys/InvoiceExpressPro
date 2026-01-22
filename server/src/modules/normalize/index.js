const router = require('./routes');
module.exports = {
    router,
    meta: {
        name: 'normalize',
        prefixes: ['/api/normalize'],
        closed: true,
        strictRouting: true
    }
};
