# Module Template & Guidelines

## 1. Module Structure (`server/src/modules/<name>/`)

Every module **MUST** follow this standalone structure. No circular dependencies outside the module.

```text
/my-module
  ├── index.js          # Entry point. Exports { router, init }.
  ├── controller.js     # Logic. Receives (req, res). Standardizes inputs.
  ├── routes.js         # Router definition. Maps paths to controller methods.
  ├── service.js        # (Optional) Business logic if complex.
  └── utils.js          # (Optional) Module-specific helpers.
```

### `index.js` Template
```javascript
const router = require('./routes');

module.exports = {
  // Required: REST Router
  router,
  
  // Optional: Init Lifecycle
  init: async (app) => {
    console.log('[MyModule] Initialized');
  },

  // Required: Metadata for Health Check
  meta: {
    name: 'my-module',
    version: '1.0.0',
    description: 'Handles X logic',
    // See "Closed Modules" section
    closed: true, 
    strictRouting: true 
  }
};
```

## 2. API Design Rules

### Project Context
- **MUST** use `req.project` (set by middleware) or `req.query.project` (legacy only).
- **NEW Modules**: Utilize `req.project` exclusively.

### Strict Routing
- Mount routes on specific prefixes defined in `app.js` and `meta`.
- **Prevent** global wildcards.
- Use `routes.js` to define paths *relative* to the mount point.

## 3. Closed Modules & Stability

Reference: `docs/MODULE_STABILITY_CONTRACT.txt`

### "Closed" Status
- A module is **Closed** when its API surface is frozen.
- **NO** breaking changes allowed to existing endpoints.
- **Changes Allowed**:
  - Non-breaking bugfixes.
  - Adding *new* optional query params.
  - Performance improvements.

### V2 Strategy
If you need to change a request/response shape fundamentally:
1.  **Do NOT** verify the existing endpoint.
2.  Create a **New Endpoint** (e.g., `/api/v2/my-resource`).
3.  Or create a **New Module** (e.g., `modules/my-module-v2`).
4.  Mark the old one as deprecated but keep it functional.
