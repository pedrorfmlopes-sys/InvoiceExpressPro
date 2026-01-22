# FRONTEND AUTH & BOOTSTRAP MAP

## 1. Entry Point & Tree
- **Entry**: `client/src/main.jsx`
- **Root Component**: `client/src/App.jsx`
- **Providers**: No global Context providers in `main.jsx`. State is managed locally in `App.jsx` and passed down via props to `AppShell`.

## 2. Router & Guards
- **Library**: Custom Tab-based routing (No `react-router-dom`).
- **State**: `activeTab` (useState in `App.jsx`).
- **Guard Logic**:
  - `App.jsx`: `useEffect` monitors `isAuthenticated` and `role`.
  - If `!isAuthenticated`: Renders `<Login />`.
  - If `role !== 'admin' && activeTab === 'config'`: Redirects to `dashboard`.
- **Redirects**:
  - Pós-Login: `handleLoginSuccess` sets `isAuthenticated(true)` -> `checkAuth()` -> UI updates.

## 3. Login Flow
- **Component**: `client/src/components/Login.jsx`
- **Action**: User submits form.
- **Call**: `await login(email, password)` (imported from `apiClient.js`).
- **Endpoint**: `POST /api/auth/login`
- **Persist**:
  - `apiClient.js` sets `localStorage.setItem('token', res.data.token)`.
  - `App.jsx` initializes `isAuthenticated` from `!!localStorage.getItem('token')`.

## 4. Bootstrap Flow (The Critical Path)
When the app loads (or after login):

1. **Trigger**: `useEffect` in `App.jsx` (on mount) OR `handleLoginSuccess` (after login).
2. **Function**: `checkAuth()` in `App.jsx` (lines 85-106).
3. **Calls**:
   ```javascript
   const [meRes, pRes] = await Promise.all([
     api.get('/api/auth/me'),
     api.get('/api/projects')
   ]);
   ```
4. **Behavior**:
   - Executes in **Parallel**.
   - **Crucial**: If EITHER fails, it catches error -> `resetAuthState()` -> Logs out user.
   - **The 304 Risk**: If the browser sends `If-None-Match` and the server replies `304 Not Modified`:
     - Axios *should* transparently handle this if the browser cache is working correctly.
     - BUT if the response object `meRes` or `pRes` is undefined or lacks `data` due to mismanaged 304 interception, code crashes (`meRes.data.user` throws).
     - However, Axios usually resolves 304 calls with the cached data seamlessly. A crash implies the 304 response body is empty and Axios isn't getting the cached body, or the structure is unexpected.

## 5. API Client (`client/src/api/apiClient.js`)
- **Lib**: `axios`
- **BaseURL**: `''` (relative)
- **Interceptors**:
  - **Request**: Adds `Authorization: Bearer <token>` from localStorage.
  - **Response**:
    - Handles 401: Tries `/api/auth/refresh` once.
    - If refresh fails: Clears token, calls `onAuthFailure()` (triggers logout in App).
- **Cache**: NO explicit cache Headers found in code (`no-cache`, `If-Modified-Since` etc. are NOT set manually).

## 6. UI Behavior on Failure
- If `/me` or `/projects` fails (401, 500, or handled 304 empty body crash):
  - `catch (err)` block in `checkAuth` runs.
  - `resetAuthState()` is called.
  - User is effectively logged out immediately after logging in.
