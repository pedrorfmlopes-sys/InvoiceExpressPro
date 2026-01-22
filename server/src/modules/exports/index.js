const router = require('./routes');
module.exports = {
    router,
    meta: {
        name: 'exports',
        prefixes: ['/api'], // /export.xlsx
        closed: true,
        strictRouting: false
    }
};
