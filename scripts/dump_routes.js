const app = require('../server/src/app');

function printStack(stack, prefix = '') {
    if (!stack) return;
    stack.forEach(layer => {
        if (layer.route) {
            const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
            console.log(`${methods} ${prefix}${layer.route.path}`);
        } else if (layer.name === 'router' && layer.handle.stack) {
            let p = layer.regexp.source
                .replace('^\\', '')
                .replace('\\/?(?=\\/|$)', '')
                .replace('(?:\\/)?$', '') // Clean up regex source a bit
                .replace(/\\\//g, '/');

            // Express regex can be messy, simple cleaning
            if (p === '^') p = '';

            printStack(layer.handle.stack, prefix + p);
        }
    });
}

console.log('--- REGISTERED ROUTES ---');
printStack(app._router.stack);
console.log('-------------------------');
