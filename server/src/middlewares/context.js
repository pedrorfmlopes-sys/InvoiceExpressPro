// server/src/middlewares/context.js
// Single point of context resolution for 'project'

/**
 * attachProjectContext
 * Ensures req.ctx.project and req.project are populated.
 * Priority: Query Param > Header > Default
 */
function attachProjectContext(req, res, next) {
    // 1. Ensure ctx exists (if auth middleware hasn't run or failed to create it)
    if (!req.ctx) {
        req.ctx = {};
    }

    // 2. Resolve Project
    // Priority:
    // 1) ?project= query param (legacy frontend, manual overrides)
    // 2) x-project header (cleaner API usage)
    // 3) 'default' fallback

    let project = 'default';

    if (req.query && req.query.project) {
        project = req.query.project;
    } else if (req.headers && req.headers['x-project']) {
        project = req.headers['x-project'];
    }

    // 3. Attach to Context and Request (Alias)
    req.ctx.project = project;
    req.project = project; // Legacy alias for easy refactoring

    // 4. Preserve existing user/org if present (don't touch)

    next();
}

module.exports = {
    attachProjectContext
};
