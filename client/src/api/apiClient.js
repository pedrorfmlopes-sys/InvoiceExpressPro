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

    // Retry once on 401 to handle expiration or initial fail
    // If no refresh token mechanism, this acts mainly as a guard against instant loops
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
        if (isAuthFailing) return Promise.reject(error); // Prevent multiple alerts/redirects

        originalRequest._retry = true;
        isAuthFailing = true; // Lock

        // LOGOUT ON 401
        // We do not have a silent refresh token flow yet.
        // Any 401 means the session is dead.
        localStorage.removeItem('token');
        onAuthFailure();

        // Reset lock after a short delay (optional, but good for SPA transition)
        setTimeout(() => { isAuthFailing = false; }, 2000);

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
