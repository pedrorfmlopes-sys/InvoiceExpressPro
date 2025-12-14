# Runtime Integration Smoke Test
Date: 2025-12-13T19:28:28.295Z
BaseURL: http://127.0.0.1:3000

| Name | Method | Path | Status | Expected | Pass | Msg |
| --- | --- | --- | --- | --- | --- | --- |
| Health | GET | /api/health | 200 | 200 | ✅ | OK |
| Get Secrets | GET | /api/config/secrets?project=smoke | 200 | 200 | ✅ | OK |
| Set Secrets | POST | /api/config/secrets?project=smoke | 200 | 200 | ✅ | OK |
| List Dirs | GET | /api/dirs?project=smoke | 200 | 200 | ✅ | OK |
| Get DocTypes | GET | /api/config/doctypes?project=smoke | 200 | 200 | ✅ | OK |
| Set DocTypes | PUT | /api/config/doctypes?project=smoke | 200 | 200 | ✅ | OK |
| Extract (Probe) | POST | /api/extract?project=smoke | ERR | 400 | ❌ | read ECONNRESET |
| Report PDF (Probe) | POST | /api/reports/pro-pdf?project=smoke | ERR | 200 | ❌ | connect ECONNREFUSED 127.0.0.1:3000 |
| Report PDF GET (Probe) | GET | /api/reports/pro-pdf?project=smoke | ERR | 404 | ❌ | connect ECONNREFUSED 127.0.0.1:3000 |
| List Transactions | GET | /api/transactions?project=smoke | ERR | 200 | ❌ | connect ECONNREFUSED 127.0.0.1:3000 |
| Normalize GET | GET | /api/normalize?project=smoke | ERR | 200 | ❌ | connect ECONNREFUSED 127.0.0.1:3000 |
| Normalize POST | POST | /api/normalize?project=smoke | ERR | 200 | ❌ | connect ECONNREFUSED 127.0.0.1:3000 |
| Mkdir (Probe) | POST | /api/mkdir?project=smoke | ERR | 200 | ❌ | connect ECONNREFUSED 127.0.0.1:3000 |
| Set Output (Probe) | POST | /api/set-output?project=smoke | ERR | 200 | ❌ | connect ECONNREFUSED 127.0.0.1:3000 |