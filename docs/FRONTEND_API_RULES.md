# Frontend API Rules

## 1. Centralized API Client

**Rule**: All HTTP requests **MUST** go through `client/src/api/apiClient.js`.

**Forbidden**:
- `fetch(...)` directly in components.
- `axios.get(...)` direct imports in components.

**Why?**
- Ensures consistent Auth headers.
- centralized error handling/logging.
- Single point for interceptors.

## 2. Contract Guards

To protect the Frontend from Backend breaking changes, critical/complex endpoints must be **Guarded**.

### How to Add a Guard
1.  **Define Shape**: In `client/src/utils/contractGuards.js`.
    ```javascript
    export const isMyResponse = (data) => {
      return data && Array.isArray(data.items);
    };
    ```
2.  **Apply Guard**: Use in the API wrapper (e.g., `apiClient.js` or module api).
    ```javascript
    import { isMyResponse, ContractError } from '../utils/contractGuards';
    
    // ...
    const res = await api.get('/path');
    if (!isMyResponse(res.data)) {
      throw new ContractError('/path', { keys: Object.keys(res.data) });
    }
    ```

## 3. Error Handling UX

Global `SystemHealthTab` and other components should handle `ContractError` gracefully.

**Standard Pattern**:
1.  Catch Error.
2.  Check `if (err instanceof ContractError)`.
3.  **User UI**: Show "System Error / Invalid Response" + Retry Button.
4.  **Admin UI**: Show collapsible details (`err.details`).
5.  **Logging**: Do NOT log the full payload to console (PII risk). Log only keys/structure if needed for debug.
