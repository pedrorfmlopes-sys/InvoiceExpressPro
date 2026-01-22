# BACKUP_NOTES.md

**Data do Backup:** 22/01/2026 (Pre-Extraction Engine Phase)
**Responsável:** Antigravity Agent

## Identificação Git
*   **Branch:** `backup/pre-extraction-engine`
*   **Tag:** `snapshot_pre_extraction_engine`
*   **Commit Hash:** (A preencher após commit)
*   **Remote Push:** Não (Local only, por defeito)

## Pacote ZIP
*   **Nome:** `PROJECT_SNAPSHOT_PRE_ENGINE.zip`
*   **Caminho:** Raiz do projeto
*   **Tamanho:** (A preencher)
*   **Conteúdo:** Snapshot total do código + Reports V2 + Mapas de Auditoria.

## Exclusões do ZIP
*   `node_modules/`
*   `dist/`, `build/`, `.cache/`
*   `.env` (Ficheiros com segredos reais)
*   `*.sqlite`, `*.db` (Exceto se for schema vazio, mas evitado por segurança)
*   `uploads/` (Conteúdo de utilizador)

## Comandos Executados
```bash
git checkout -b backup/pre-extraction-engine
git add -A
git commit -m "backup: estado antes do motor v1 de leitura/extracao"
git tag -a snapshot_pre_extraction_engine -m "Snapshot antes do motor v1"
```
