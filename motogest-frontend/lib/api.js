import axios from 'axios';
import Cookies from 'js-cookie';

// ── Instância base ──────────────────────────────────────────────
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request: injeta JWT ─────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = Cookies.get('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: refresh automático no 401 ────────────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          })
          .catch((err) => Promise.reject(err));
      }

      original._retry = true;
      isRefreshing = true;

      const refreshToken = Cookies.get('refreshToken');

      if (!refreshToken) {
        isRefreshing = false;
        redirectToLogin();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/refresh`,
          { refreshToken }
        );

        Cookies.set('accessToken',  data.accessToken,  { expires: 1,  secure: true, sameSite: 'strict' });
        Cookies.set('refreshToken', data.refreshToken, { expires: 7,  secure: true, sameSite: 'strict' });

        api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
        processQueue(null, data.accessToken);

        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuth();
        redirectToLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Helpers ─────────────────────────────────────────────────────
export const setAuthCookies = (accessToken, refreshToken) => {
  Cookies.set('accessToken',  accessToken,  { expires: 1, secure: true, sameSite: 'strict' });
  Cookies.set('refreshToken', refreshToken, { expires: 7, secure: true, sameSite: 'strict' });
};

export const clearAuth = () => {
  Cookies.remove('accessToken');
  Cookies.remove('refreshToken');
  Cookies.remove('user');
};

const redirectToLogin = () => {
  if (typeof window !== 'undefined' && window.location.pathname !== '/') {
    window.location.href = '/';
  }
};

// ── Extrai mensagem de erro legível ─────────────────────────────
export const getErrorMessage = (err) =>
  err?.response?.data?.error ||
  err?.response?.data?.message ||
  err?.message ||
  'Erro inesperado.';

export default api;
