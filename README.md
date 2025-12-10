# Invoice App Excel — Replit Ready

## Como usar (Replit)
1) Importe este ZIP para um novo Repl **Node.js**.
2) Defina a variável de ambiente **OPENAI_API_KEY** (Secrets).
3) Clique **Run**. O Repl:
   - instala deps do frontend, faz `build`,
   - arranca o servidor Express,
   - serve o frontend estático em `/`.

## Endpoints
- `POST /api/extract` — upload de PDF(s) (`multipart/form-data`, campo `files`).
- UI Web: raiz `/` (build do Vite).

## Notas
- Se **OPENAI_API_KEY** não estiver definida, usa **fallback** por regex.
- O Excel é criado/atualizado em `./data/invoices.xlsx`.
