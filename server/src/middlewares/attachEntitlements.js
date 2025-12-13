// server/src/middlewares/attachEntitlements.js

module.exports = (req, res, next) => {
    // Configuração padrão para Phase 1 (Tudo permitido)
    req.ctx = req.ctx || {};
    req.ctx.entitlements = {
        canEdit: true,
        canDelete: true,
        canExport: true,
        maxUploadSize: 50 * 1024 * 1024,
    };
    req.ctx.user = {
        id: 'default',
        role: 'admin'
    };
    next();
};
