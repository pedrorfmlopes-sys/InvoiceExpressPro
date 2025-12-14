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
let isAuthFailing = false;

api.interceptors.response.use(response => {
    return response;
}, async error => {
    const originalRequest = error.config;

    // Logout on 401 (Single-flight Guard)
    // We do not have a silent refresh token flow. Any 401 invalidates the session.
    if (error.response && error.response.status === 401) {
        if (isAuthFailing) return Promise.reject(error); // Prevent multiple alerts/redirects

        isAuthFailing = true; // Lock
        localStorage.removeItem('token');
        onAuthFailure();

        // Lock remains true until page reload or re-login event implies a reset.
        // For now, we leave it locked to prevent any further 401 spam from existing parallel requests.
        // A simple timeout releases it in case the app doesn't reload and user stays on public page.
        setTimeout(() => { isAuthFailing = false; }, 5000);

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
