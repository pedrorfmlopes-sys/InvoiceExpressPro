const app = require('../server/src/app');

function printRoutes(path, layer) {
    if (layer.route) {
        layer.route.stack.forEach(printRoutes.bind(null, path.concat(split(layer.route.path))));
    } else if (layer.name === 'router' && layer.handle.stack) {
        layer.handle.stack.forEach(printRoutes.bind(null, path.concat(split(layer.regexp))));
    } else if (layer.method) {
        console.log('%s /%s',
            layer.method.toUpperCase(),
            path.concat(split(layer.route.path)).filter(Boolean).join('/'));
    }
}

function split(thing) {
    if (typeof thing === 'string') {
        return thing.split('/');
    } else if (thing.fast_slash) {
        return '';
    } else {
        var match = thing.toString()
            .replace('\\/?', '')
            .replace('(?=\\/|$)', '$')
            .match(/^\/\^((?:\\[.*+?^${}()|[\]\\\/]|[^.*+?^${}()|[\]\\\/])*)\$\//)
        return match
            ? match[1].replace(/\\(.)/g, '$1').split('/')
            : '<complex:' + thing.toString() + '>';
    }
}

// Simple stack traversal
function list(stack, prefix = '') {
    stack.forEach(r => {
        if (r.route && r.route.path) {
            const methods = Object.keys(r.route.methods).join(',').toUpperCase();
            console.log(`${methods} ${prefix}${r.route.path}`);
        } else if (r.name === 'router' && r.handle.stack) {
            let nextPrefix = prefix;
            // Extract prefix from regex if possible or just assume mounted path context
            // Express regex is messy to parse back to string.
            // Using a simpler approach: define known mounts manually or just standard dump?
        }
    });
}

// We will rely on listing the mounts we know we changed + standard output
// Actually, let's just do a manual comprehensive list in the proof file based on code analysis
// Creating a runtime dumper is tricky with Express 4 regexes.
// I will create a static proof file instead.
