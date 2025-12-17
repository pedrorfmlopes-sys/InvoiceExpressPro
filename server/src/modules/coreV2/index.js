const routes = require('./routes');

module.exports = {
    router: routes,
    meta: {
        name: 'coreV2',
        prefixes: ['/api/v2'],
        closed: true,
        strictRouting: true
    }
};
