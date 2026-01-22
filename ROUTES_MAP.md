# ROUTES_MAP.md
**Servidor:** Express
**Prefixos:** `/api`, `/api/v2`, `/api/health`, `/api/auth`, `/api/export.xlsx`

| Prefixo | Método | Endpoint | Handler (Ficheiro > Função) | Auth | Notas |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api` | POST | `/extract` | `server/src/modules/processing/controller.js` > `extract` | Entitlement | **Legacy**. Usado pelo frontend. |
| `/api` | GET | `/progress/:batchId` | `server/src/modules/processing/controller.js` > `getProgress` | - | Polling de estado. |
| `/api` | GET | `/batch/:batchId` | `server/src/modules/processing/controller.js` > `getBatch` | - | Resultados do batch. |
| `/api` | POST | `/export.xlsx` | `server/src/modules/exports/controller.js` > `exportXlsx` | - | Exportação Excel (Legacy). |
| `/api` | GET | `/config` | `server/src/modules/config/index.js` | Admin | Leitura de segredos/doctypes. |
| `/api/v2` | POST | `/extract` | `server/src/modules/coreV2/controller.js` > `extract` | - | **V2 Pipeline** (Ignorado pelo frontend). |
| `/api/v2` | POST | `/upload` | `server/src/modules/coreV2/controller.js` > `upload` | - | Upload V2. |
| `/api/v2` | GET | `/docs` | `server/src/modules/coreV2/controller.js` > `listDocs` | - | Listagem principal (Core V2). |
| `/api/v2` | PATCH| `/docs/:id` | `server/src/modules/coreV2/controller.js` > `updateDoc` | - | Edição manual. |
| `/api/auth`| POST | `/login` | `server/src/controllers/authController.js` > `login` | - | JWT Issue. |
| `/api/health`| GET | `/modules` | `server/src/modules/health/index.js` | - | Status do sistema. |

**Outras Rotas (Parity/Legacy):**
*   `/api/templates` (`server/src/routes/templatesRoutes.js`)
*   `/api/project` (`server/src/routes/projectRoutes.js`)
*   `/api/dossiers` (`server/src/modules/dossiers`)

**Montagem (Server ENTRY):**
*   `server/src/app.js` orquestra todos os `app.use` em ordem.
*   Middleware `attachContext` e `requireAuth` aplicados globalmente a `/api` (exceto whitelists).
