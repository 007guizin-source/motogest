import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import api, { setAuthCookies, clearAuth, getErrorMessage } from '../lib/api';

const AuthContext = createContext(null);

// Rotas que NÃO precisam de autenticação
const PUBLIC_ROUTES = ['/'];

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Carrega usuário salvo ao iniciar
  useEffect(() => {
    const savedUser = Cookies.get('user');
    const token     = Cookies.get('accessToken');

    if (savedUser && token) {
      try { setUser(JSON.parse(savedUser)); }
      catch { clearAuth(); }
    }
    setLoading(false);
  }, []);

  // Redireciona para login se rota protegida sem token
  useEffect(() => {
    if (!loading && !user && !PUBLIC_ROUTES.includes(router.pathname)) {
      router.replace('/');
    }
  }, [user, loading, router.pathname]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password });

    setAuthCookies(data.accessToken, data.refreshToken);
    Cookies.set('user', JSON.stringify(data.user), { expires: 1, sameSite: 'strict' });
    setUser(data.user);

    router.push('/dashboard');
    return data.user;
  }, [router]);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    router.push('/');
  }, [router]);

  const isAdmin   = user?.role === 'admin';
  const isGerente = user?.role === 'admin' || user?.role === 'gerente';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isGerente }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
