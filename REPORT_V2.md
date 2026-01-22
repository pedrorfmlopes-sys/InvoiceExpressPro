# REPORT_V2.md: Relatório de Auditoria Técnica Complementar (Deep Dive)

**Data:** 22/01/2026
**Auditor:** Antigravity (Agentic AI)
**Âmbito:** Análise estática profunda "read-only" do código (`server` e `client`).

---

## 1. Arranque e Validação

Para arrancar o projeto em modo de desenvolvimento seguro:

*   **Comando:** `npm run dev:safe` (Executa `scripts/dev_workdir_runner.js`)
    *   *Nota:* Em Windows com PowerShell bloqueado, usar `cmd /c "npm run dev:safe"`.
*   **Portas:**
    *   Backend: `3000` (Express)
    *   Frontend: `5173` (Vite)
*   **Variáveis de Ambiente Obrigatórias (`.env`):**
    *   `DB_CLIENT`: `sqlite` ou `pg`
    *   `DATABASE_URL`: (Obrigatório se `pg`)
    *   `AUTH_MODE`: `required` (Força verificação de tokens)
    *   `OPENAI_API_KEY`: Essencial para extração AI (sem isto, falha silenciosamente p/ regex).

---

## 2. Mapa REAL de Rotas e Endpoints

A aplicação possui uma arquitetura de rotas dividida entre "Módulos V2" e "Rotas Legacy/Parity".

**ATENÇÃO CRÍTICA:** Existe sobreposição funcional entre módulos.

| Método | Endpoint (Prefixo) | Módulo Real | Handler (Ficheiro > Função) | Notas |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/extract` | `processing` | `server/src/modules/processing/controller.js` > `extract` | **USADO PELO FRONTEND ATUAL** (Legacy Pipeline). |
| `POST` | `/api/v2/extract` | `coreV2` | `server/src/modules/coreV2/controller.js` > `extract` | **NÃO USADO** (Pipeline V2 mais robusto, mas ignorado). |
| `GET` | `/api/v2/docs` | `coreV2` | `server/src/modules/coreV2/controller.js` > `listDocs` | Listagem principal da tabela. |
| `POST` | `/api/auth/login` | `auth ` | `server/src/controllers/authController.js` > `login` | Autenticação JWT. |
| `POST` | `/api/export.xlsx` | `exports` | `server/src/modules/exports/controller.js` > `exportXlsx` | Exportação (via módulo `exports` montado em `/api`). |
| `POST` | `/api/v2/export.xlsx`| `coreV2` | `server/src/modules/coreV2/controller.js` > `exportXlsx`| Exportação V2 (via módulo `coreV2`), também duplicada/alternativa. |

**Evidência:**
*   `server/src/app.js`: Linhas 82 (`app.use('/api', require('./modules/processing').router)`) e 66 (`app.use('/api/v2', coreV2.router)`).
*   `Processing` monta `/extract` na raiz `/api`. `CoreV2` monta `/extract` sob `/api/v2`.

---

## 3. Frontend: Integração e "Wiring"

O frontend está ligado maioritariamente ao backend legacy para ações críticas.

*   **Página Principal:** `CoreV2Tab.jsx`
*   **Ação de Upload:**
    *   Chama `api.post('/api/extract', ...)` (Linha 58 de `CoreV2Tab.jsx`).
    *   **Consequência:** Os ficheiros são processados pelo controlador antigo (`processing`), que tem lógica de "Perfis Mockados" e validação mais fraca que o novo controlador `coreV2`.
*   **Ação de Listagem:**
    *   Hook `useExplorer.js` chama `/api/v2/docs` (Correto, usa CoreV2).
*   **Visualização PDF:**
    *   Chama `/api/doc/view?id=...`. Mapeado em `modules/docs` (Legacy).

**Conclusão:** O Frontend é um híbrido que lê do V2 mas escreve/processa no V1.

---

## 4. Matriz de Upload e Suporte a Ficheiros

| Tipo de Ficheiro | Estado | Motivo Técnico | Evidência |
| :--- | :--- | :--- | :--- |
| **PDF (Texto nativo)** | **OK** | Usa `pdf-parse`. Extrai texto com sucesso. | `processing/controller.js`:97 |
| **PDF (Digitalizado/Imagem)** | **QUEBRADO** | `pdf-parse` retorna string vazia ou lixo. **NÃO EXISTE OCR**. | Dependências (`package.json`) não incluem tesseract/vision. |
| **Imagens (JPG/PNG)** | **QUEBRADO** | Controller assume pipeline PDF. Pode aceitar upload (multer) mas falha no parse. | Controlador não tem lógica para `image/*`. |

---

## 5. Pipeline de Extração (O Que Realmente Acontece)

Devido ao frontend usar `/api/extract` (Processing Module), o fluxo real é:

1.  **Upload:** `processing/controller.js` recebe ficheiros via Multer. Salva em `uploads/`.
2.  **Parse:** `pdf(buffer)` extrai texto cru.
3.  **Lógica A (Profile - MOCK):**
    *   Chama `ExtractionService.matchProfile`.
    *   Se der match, cria um resultado com confiança alta, mas *não extrai campos específicos* (código diz `// Mock extraction`).
4.  **Lógica B (AI - GPT-3.5):**
    *   Se não houve perfil E tem API Key E texto > 200 chars.
    *   Chama OpenAI `gpt-3.5-turbo-1106`. Schema JSON simples.
5.  **Lógica C (Fallback Regex):**
    *   Se AI falhar ou texto curto.
    *   Regex rudimentar para Data, Total, DocNumber.
6.  **Gravação:**
    *   Copia ficheiro para pasta `staging`.
    *   Insere na DB (`Adapter.saveDocument`) com `status: 'staging'`.
    *   **RAM State:** Atualiza `progressMap` em memória (se o servidor reiniciar durante upload, o frontend perde a barra de progresso).

*(Pipeline V2 - Desativado/Não usado: Teria melhor validação de DocNumber, melhor Regex, e Quality Gates de consistência Cliente/Fornecedor, mas não está a ser chamado).*

---

## 6. Persistência e Armazenamento

*   **Database Real:**
    *   SQLite: `data/db.sqlite` (Resolvido relative path a partir de `server/src/db/knex.js`).
*   **Tabelas Chave (`migrations`):**
    *   `documents`: Tabela principal. Colunas JSON (`raw_json`, `references_json`) guardam payload da AI.
    *   `doc_links`: Relações entre documentos (V2).
    *   `reading_profiles`: Tabela de perfis (existe schema, mas lógica aplicacional fraca).
*   **Limitações:**
    *   `processing/controller.js` usa `fs.readFileSync` (Síncrono/Bloqueante) para ler o PDF inteiro para RAM antes do parse. Perigoso para ficheiros > 10MB ou concorrência alta.

---

## 7. Bugs e Riscos Confirmados

| Prioridade | Descrição | Evidência / Ficheiro | Impacto |
| :--- | :--- | :--- | :--- |
| **P0** | **Rota de Extração Errada** | `CoreV2Tab.jsx`:58 chama `/api/extract` (V1) em vez de `/api/v2/extract`. | A app ignora todas as melhorias de lógica do backend V2 (Quality gates, canonical types). |
| **P0** | **Sem Suporte OCR** | Zero referências a OCR no código. `pdf-parse` é a única ferramenta. | Upload de faturas scan/foto resulta em extração vazia/falha. |
| **P1** | **Bloqueio Event Loop** | `fs.readFileSync(f.path)` em loop dentro do controller. | `processing/controller.js`:96. Bloqueia o servidor Node.js inteiro durante leitura de PDFs grandes. |
| **P2** | **Estado em RAM** | `progressMap` (Linha 31) é variável global em memória. | Se o servidor reiniciar (deploy/erro), o frontend fica preso em "Processing 0%" infinitamente. |
| **P2** | **Modelo AI Obsoleto** | Hardcoded `gpt-3.5-turbo-1106`. | `processing/controller.js`:133. Paga caro por performance inferior ao GPT-4o-mini. |

---

## 8. Hotspots (Arquivos Críticos)

1.  `server/src/modules/processing/controller.js` (Lógica ATUAL de extração - Legacy).
2.  `server/src/modules/coreV2/controller.js` (Lógica NOVA de extração - Ignorada).
3.  `client/src/tabs/CoreV2Tab.jsx` (UI Principal e ponto de erro de rota).
4.  `server/src/db/knex.js` (Configuração crítica DB).
5.  `server/src/modules/extraction/service.js` (Serviço de perfis incompleto/mock).
6.  `server/src/app.js` (Mapa de rotas e confusão de mounting).
7.  `server/src/storage/DbDocsAdapter.js` (Camada de acesso a dados).
8.  `server/src/modules/exports/controller.js` (Geração de Excel).
9.  `client/src/api/apiClient.js` (Configuração Axios frontend).
10. `server/src/modules/config/index.js` (Gestão de segredos).
11. `server/src/services/DocService.js` (Lógica partilhada).
12. `server/src/modules/transactions/controller.js` (Lógica de transações V2).
13. `scripts/dev_workdir_runner.js` (Script de arranque).
14. `server/src/middleware/auth.js` (Segurança).
15. `package.json` (Dependências faltosas).

---
**Fim do Relatório V2.**
