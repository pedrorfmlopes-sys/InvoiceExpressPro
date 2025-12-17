const router = require('./routes');
module.exports = {
    router,
    meta: {
        name: 'audit',
        prefixes: ['/api/audit'],
        closed: true,
        strictRouting: true
    }
};
