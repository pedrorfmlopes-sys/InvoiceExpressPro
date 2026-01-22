# ENV_REQUIRED.md

Configuração obrigatória para execução do projeto.

```ini
# Servidor HTTP Port
PORT=3000

# Base de Dados (Escolher Um)
# Opção A: SQLite (Simples, ficheiro local)
DB_CLIENT=sqlite
# SQLITE_FILENAME=./data/db.sqlite (Opcional)

# Opção B: Postgres (Produção)
# DB_CLIENT=pg
# DATABASE_URL=postgres://user:pass@localhost:5432/invoicestudio

# Autenticação
AUTH_MODE=required
# JWT_SECRET=... (Opcional, gera random se omitido)

# Inteligência Artificial (Obrigatório para extração funcionar)
OPENAI_API_KEY=sk-proj-...

# Frontend (Para CORS)
CLIENT_URL=http://localhost:5173
```
