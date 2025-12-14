# Release Notes v2.8.0

## Highlights
- **Search Performance**: Optimized global search with `pg_trgm` indexes (Postgres).
- **Exports Streaming**: Refactored exports (V1 and V2) to use Node.js streams, significantly reducing memory usage for large datasets.
- **Robustness**: V2 Exports now handle paginated database adapters (e.g., Postgres `rows`) gracefully.
- **Testing**: Added smoke tests for V2 Exports (`npm run smoke:v2_8:sqlite`, `npm run smoke:v2_8:pg`).
- **Docs**: Updated Quickstart guide with comprehensive verification steps.

## Breaking Changes
- None.

## How to Verify
Run the smoke tests included in this release:

```bash
# SQLite
npm run smoke:v2_8:sqlite

# Postgres (requires DB)
npm run smoke:v2_8:pg
```
