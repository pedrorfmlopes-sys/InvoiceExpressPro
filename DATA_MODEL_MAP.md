# DATA_MODEL_MAP.md

**Persistência:** Relacional (SQL)
**Drivers:** `sqlite3` (Default/Dev) ou `pg` (Production).
**Gestão:** `Knex.js` e Migrations.

## Schema Principal

### `documents`
Tabela central de documentos.
*   `id` (UUID)
*   `project` (String - Contexto Multi-tenant)
*   `docType` (String - Legacy)
*   `docTypeLabel`, `docTypeId` (Canonical V2)
*   `docNumber`, `date`, `total`, `currency`
*   `supplier`, `customer`
*   `raw_json` (JSON - Resposta completa da AI)
*   `status` (Enum: `uploaded`, `staging`, `extracted`, `verified`)
*   `filePath` (Caminho absoluto para ficheiro em disco)

### `doc_links` (V2)
Relações entre documentos.
*   `from_id`, `to_id`
*   `type` (ex: `related`, `attachment`)

### `reading_profiles`
Configuração de leitura por regras.
*   `name`, `priority`, `active`
*   Acoplado a tabela `reading_profile_signatures` (keywords).

## Armazenamento de Ficheiros
*   **Upload (Temp):** `root/uploads/`
*   **Staging (Persistente):** `root/data/<project>/staging/` (Configurável via Context).
*   **Export (Temp):** `os.tmpdir()`

## Riscos
*   `raw_json` pode crescer indefinidamente.
*   Ficheiros físicos (`filePath`) não são apagados consistentemente se o registo DB for removido (depende da lógica de delete soft vs hard).
