# V2.7 Review Pack (RBAC Enforced)

## 1. Auth Middleware (`server/src/middlewares/auth.js`)
**Goal**: Enforce strict role checking based on `req.ctx.role`.
```javascript
function requireRole(role) {
    return (req, res, next) => {
        // Optional mode bypass (dev only)
        if (AUTH_MODE === 'optional') return next();
        
        // Strict Check
        if (req.ctx && req.ctx.role === role) return next();
        
        return res.status(403).json({ 
            code: 'FORBIDDEN', 
            error: 'Access denied',
            requiredRole: role,
            currentRole: req.ctx ? req.ctx.role : 'guest'
        });
    };
}
```

## 2. Role Source (`server/src/controllers/authController.js`)
**Goal**: Include role in Login Token and Context.
```javascript
// Login: Include role in JWT
const accessToken = jwt.sign({ 
    userId: ctx.user.id, 
    orgId: ctx.org.id, 
    role: ctx.role // <--- Added
}, JWT_SECRET, { expiresIn: '15m' });

// /me Endpoint: Expose role to frontend
exports.me = (req, res) => {
    res.json({
        user: req.ctx.user,
        role: req.ctx.role, // <--- Added
        // ...
    });
};
```

## 3. Protected Routes (`server/src/routes/v2Routes.js`)
**Goal**: Lock down critical endpoints.
```javascript
const { requireRole } = require('../middlewares/auth');

// DocTypes CRUD (Admin Only)
router.post('/doctypes', requireRole('admin'), coreController.createDocType);
router.put('/doctypes/:id', requireRole('admin'), coreController.updateDocType);
router.delete('/doctypes/:id', requireRole('admin'), coreController.deleteDocType);
```

## 4. Frontend UI Gating (`client/src/App.jsx`)
**Goal**: Hide Admin tabs for non-admin users.
```javascript
  // Filter Tabs based on Role
  let visibleTabs = TABS.filter(t => !t.hidden);
  if (role !== 'admin') {
    visibleTabs = visibleTabs.filter(t => t.id !== 'config'); // Hide Config/Admin
    // If current active tab is forbidden, switch to safe default
    if (activeTab === 'config') setActiveTab('corev2');
  }
```

## 5. Verification
- **Test Script**: `scripts/smoke_v2_7_rbac.js`
- **Runner**: `scripts/run_smoke_with_server.js` (Patched for Windows `spawn`)
- **CI**: Runs `npm run smoke:v2_7:sqlite` and `pg`.
