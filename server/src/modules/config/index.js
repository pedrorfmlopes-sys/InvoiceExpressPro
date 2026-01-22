const router = require('./routes');

module.exports = {
    name: 'config',
    router,
    prefixes: ['/api/config'],
    closed: true // Internal module
};
