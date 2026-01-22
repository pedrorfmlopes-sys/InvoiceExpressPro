const routerV2 = require('./routesV2');
const routerLegacy = require('./routesLegacy');

module.exports = {
    routerV2,
    routerLegacy,
    meta: {
        name: 'reports',
        prefixes: ['/api/v2/reports', '/api/reports'],
        closed: true,
        strictRouting: true
    }
};
