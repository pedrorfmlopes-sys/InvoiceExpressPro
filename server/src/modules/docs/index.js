const routes = require('./routes');

module.exports = {
    router: routes,
    meta: {
        name: 'docs',
        prefixes: ['/api'],
        closed: true,
        strictRouting: false
    }
};
