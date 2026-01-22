const routes = require('./routes');

module.exports = {
    router: routes,
    meta: {
        name: 'transactions',
        prefixes: ['/api/transactions'],
        closed: true,
        strictRouting: false
    }
};
