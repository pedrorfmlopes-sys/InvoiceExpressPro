import axios from 'axios';

// Event emitter for auth failures
let onAuthFailure = () => { };

export const setOnAuthFailure = (fn) => {
    onAuthFailure = fn;
};

const api = axios.create({
    baseURL: '', // Relative to current origin
});

// Request Interceptor: Attach Token
api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, error => Promise.reject(error));

// Response Interceptor: Handle 401
api.interceptors.response.use(response => {
    return response;
}, async error => {
    const originalRequest = error.config;

    // If 401 and we haven't retried yet
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        // Trigger generic auth failure (logout UI)
        // We do NOT auto-login with hardcoded creds in the client for security.
        // The instruction for "bootstrap+login" in 401 is interpreted as a Dev/Smoke pattern,
        // but for the user-facing client, we should redirect to login.

        // Remove invalid token
        localStorage.removeItem('token');
        onAuthFailure();

        return Promise.reject(error);
    }

    return Promise.reject(error);
});

export const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password });
    if (res.data.token) {
        localStorage.setItem('token', res.data.token);
    }
    return res.data;
};

export const logout = () => {
    localStorage.removeItem('token');
    onAuthFailure();
};

export const downloadFile = async (url, params = {}) => {
    const response = await api.get(url, {
        params,
        responseType: 'blob'
    });
    return response.data;
};

export default api;
