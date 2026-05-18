import React, { useState } from 'react';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/auth.store';
import Button from '../components/ui/Button';

export default function LoginPage() {
  const { login, loading, error } = useAuthStore();
  const [email,    setEmail]    = useState('admin@lavasuit.com');
  const [password, setPassword] = useState('');
  const [touched,  setTouched]  = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!email || !password) return;
    try { await login(email, password); } catch {}
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* Panel izquierdo: marca */}
      <aside className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 text-white p-12">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_30%,white_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-white/10 backdrop-blur ring-1 ring-white/20 text-white font-semibold flex items-center justify-center">
              L
            </div>
            <p className="font-semibold tracking-tight">LavaSuit</p>
          </div>
          <div className="mt-auto">
            <h2 className="text-3xl font-semibold leading-tight">
              Operación de lavandería,<br />simplificada.
            </h2>
            <p className="mt-3 text-primary-100 max-w-md">
              Pedidos, clientes, pagos y reportes en un solo panel —
              en tiempo real entre el local y los celulares de tu equipo.
            </p>
          </div>
        </div>
      </aside>

      {/* Panel derecho: formulario */}
      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white font-semibold flex items-center justify-center shadow-card">
              L
            </div>
            <p className="font-semibold text-slate-900">LavaSuit</p>
          </div>

          <h1 className="text-xl font-semibold text-slate-900">Iniciar sesión</h1>
          <p className="text-sm text-slate-500 mt-1">Ingresa con tu cuenta de administrador.</p>

          {error && (
            <div className="mt-5 flex items-start gap-2 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">Email</span>
              <div className="mt-1.5 relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="tu@email.com"
                  className="w-full h-10 border border-slate-300 rounded-lg pl-9 pr-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </div>
              {touched && !email && (
                <span className="text-xs text-danger-600 mt-1 block">Ingresa tu email</span>
              )}
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-700">Contraseña</span>
              <div className="mt-1.5 relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="w-full h-10 border border-slate-300 rounded-lg pl-9 pr-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </div>
              {touched && !password && (
                <span className="text-xs text-danger-600 mt-1 block">Ingresa tu contraseña</span>
              )}
            </label>

            <Button type="submit" loading={loading} block size="md">
              {loading ? 'Ingresando…' : 'Iniciar sesión'}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-8">
            © {new Date().getFullYear()} LavaSuit
          </p>
        </div>
      </main>
    </div>
  );
}
