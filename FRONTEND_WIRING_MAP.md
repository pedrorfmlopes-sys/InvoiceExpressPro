# FRONTEND_WIRING_MAP.md

**Estratégia API:** Híbrida (Legacy V1 + Core V2)

| Componente/Tab | Rota Frontend | Endpoint Chamado | Status | Notas |
| :--- | :--- | :--- | :--- | :--- |
| `CoreV2Tab.jsx` | `/core` (ou index) | `POST /api/extract` | **WIRED (Legacy)** | Usa rota antiga para upload/extração. |
| `CoreV2Tab.jsx` | `/core` | `GET /api/v2/docs` | **WIRED (V2)** | Lista documentos usando endpoint V2. |
| `CoreV2Tab.jsx` | `/core` | `GET /api/doc/view?id=` | **WIRED (Legacy)** | Visualização de PDF. |
| `Login.jsx` | `/login` | `POST /api/auth/login` | **WIRED** | Autenticação padrão. |
| `TransactionsTab.jsx`| `/transactions` | `GET /api/transactions` | **WIRED** | Módulo de transações bancárias. |
| `ReportsTab.jsx` | `/reports` | `GET /api/v2/reports/*` | **WIRED** | Relatórios financeiros. |
| `ConfigTab.jsx` | `/settings` | `GET/POST /api/config` | **WIRED** | Configuração de API Keys. |
| `ProcessV2Tab.jsx` | (Não usado?) | `POST /api/extract` | **DEAD CODE?** | Parece ser versão alternativa da CoreV2Tab. |

**Pontos Críticos:**
1.  **Inconsistência de Extração:** A UI principal (`CoreV2Tab`) usa o endpoint legado `/api/extract`, impedindo o uso das melhorias do V2.
2.  **Mistura V1/V2:** Componentes partilham helpers (`apiClient.js`) mas apontam para versões diferentes da API.
