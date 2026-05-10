import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage } from '../lib/api';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm]       = useState({ email: 'admin@motogest.com', password: '' });
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handle = async (e) => {
    e?.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(form.email, form.password || 'admin123');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05050d] flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(249,115,22,.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(96,165,250,.05) 0%, transparent 60%)' }}
      />

      <div className="card w-full max-w-sm relative anim-fade-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-3xl shadow-lg">
            🏍
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">MotoGest</h1>
          <p className="text-sm text-dark-300">Sistema de Gestão para Moto Peças</p>
        </div>

        <form onSubmit={handle} className="space-y-4">
          <div>
            <label className="label">E-mail</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="admin@motogest.com"
              required
            />
          </div>

          <div>
            <label className="label">Senha</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={show ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder="Deixe em branco = admin123"
              />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
              >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full justify-center py-3 text-base mt-2"
            disabled={loading}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Entrar no Sistema'}
          </button>
        </form>

        <p className="text-center text-xs text-dark-400 mt-5">
          Demo: <span className="text-brand-500">admin@motogest.com</span> / senha em branco
        </p>
      </div>
    </div>
  );
}
