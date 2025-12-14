import axios from 'axios';

// Event emitter for auth failures
let onAuthFailure = () => { };

export const setOnAuthFailure = (fn) => {
    onAuthFailure = fn;
};

const api = axios.create({
    baseURL: '', // Relative to current origin
    withCredentials: true // Send cookies
});

// Request Interceptor: Attach Token
api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, error => Promise.reject(error));

// Refresh Logic
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Response Interceptor: Handle 401 & Refresh
api.interceptors.response.use(response => {
    return response;
}, async error => {
    const originalRequest = error.config;

    // Guard: If 401 (Unauthorized)
    if (error.response && error.response.status === 401) {

        // If it's the refresh endpoint itself failing -> Logout
        if (originalRequest.url.includes('/auth/refresh')) {
            localStorage.removeItem('token');
            onAuthFailure();
            return Promise.reject(error);
        }

        // If generic 401 and we haven't retried yet
        if (!originalRequest._retry) {
            // Check specific code if available (e.g., TOKEN_EXPIRED)
            // Or assume any 401 on protected route means expiry

            if (isRefreshing) {
                // If already refreshing, queue this request
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers.Authorization = 'Bearer ' + token;
                    return api(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // Attempt Refresh
                const rs = await api.post('/api/auth/refresh');
                const { token } = rs.data;

                if (token) {
                    localStorage.setItem('token', token);
                    api.defaults.headers.common['Authorization'] = 'Bearer ' + token;
                    originalRequest.headers['Authorization'] = 'Bearer ' + token;

                    processQueue(null, token);
                    isRefreshing = false;

                    return api(originalRequest);
                }
            } catch (err) {
                processQueue(err, null);
                isRefreshing = false;

                // If refresh failed, logout
                localStorage.removeItem('token');
                onAuthFailure();
                return Promise.reject(err);
            }
        }
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

export const logout = async () => {
    try {
        await api.post('/api/auth/logout');
    } catch (e) { /* ignore */ }
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
