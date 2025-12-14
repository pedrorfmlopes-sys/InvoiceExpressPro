// scripts/audit_routes.js
const app = require('../server/src/app');

function printRoutes(stack, prefix = '') {
    let routes = [];
    stack.forEach(layer => {
        if (layer.route) {
            const path = layer.route.path;
            const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
            routes.push({ path: prefix + path, methods, source: 'src/routes' });
        } else if (layer.name === 'router' && layer.handle.stack) {
            // Drill down into nested routers
            const newPrefix = prefix + (layer.regexp.source !== '^\\/?$' ? layer.regexp.source.replace('^\\', '').replace('\\/?(?=\\/|$)', '') : '');
            // Clean up regex artifacts if simple path
            const cleanPrefix = newPrefix.replace(/\\\//g, '/').replace('(?:\\/)?$', '');
            routes = routes.concat(printRoutes(layer.handle.stack, cleanPrefix));
        }
    });
    return routes;
}

try {
    const r = printRoutes(app._router.stack);
    console.log('--- FOUND ROUTES ---');
    r.forEach(x => console.log(`${x.methods} ${x.path}`));
} catch (e) {
    console.error('Audit Error:', e.message);
}
