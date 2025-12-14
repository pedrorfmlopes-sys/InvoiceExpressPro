// server/src/scripts/dump_express_routes.js
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = ':memory:'; // Avoid locking real DB
process.env.JWT_SECRET = 'dump_test_secret';

const app = require('../server/src/app');

function printRoutes(stack, basePath = '') {
    stack.forEach(layer => {
        if (layer.route) {
            // It's a route
            const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
            console.log(`${methods.padEnd(7)} ${basePath}${layer.route.path}`);
        } else if (layer.name === 'router' && layer.handle.stack) {
            // It's a router
            let routerPath = basePath;
            // Trim regex characters for cleaner output if possible, but usually path is undefined for top level or captured in regexp
            // We often have to guess or use the regex source
            // Simple approach for now:
            const match = layer.regexp.toString().match(/^\/\^\\(\/.*?)\\\/\?(\$\/)?/);
            const prefix = match ? match[1].replace(/\\/g, '') : '';

            // If prefix is simple, append. 
            // Ideally we just want to see the registered paths.
            // Many express setups mount on /api. 
            // Let's rely on standard express structure if possible.

            // Recursion
            printRoutes(layer.handle.stack, basePath + prefix);
        }
    });
}

// Inspect main router stack
// Note: app._router might not be populated until listen, or it is populated as we define routes?
// app.js exports 'app'. It usually has _router if lines like app.use(...) were called.

if (app._router && app._router.stack) {
    console.log("Method  Path");
    console.log("------  ----");
    printRoutes(app._router.stack);
} else {
    // If app doesn't have _router, it might be because it's not fully initialized or it's a sub-app structure
    // We will try to listen briefly or just check routes if exposed.
    console.log("No _router found on exported app. Trying to infer from app.mountpath or manual inspection.");
    // Usually app.js has app.use('/api', ...);

    // Fallback: iterate over app._router.stack if it exists.
}
