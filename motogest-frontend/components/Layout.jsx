import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, ShoppingCart, Package, Users, DollarSign, BarChart2, Shield, LogOut, Menu, X, Bell, Tag } from 'lucide-react';
import clsx from 'clsx';

const NAV = [
  { href: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard',   roles: ['admin','gerente','caixa'] },
  { href: '/pdv',        icon: ShoppingCart,    label: 'Caixa / PDV', roles: ['admin','gerente','caixa'] },
  { href: '/estoque',    icon: Package,         label: 'Estoque',     roles: ['admin','gerente'] },
  { href: '/clientes',   icon: Users,           label: 'Clientes',    roles: ['admin','gerente','caixa'] },
  { href: '/financeiro', icon: DollarSign,      label: 'Financeiro',  roles: ['admin','gerente'] },
  { href: '/relatorios', icon: BarChart2,       label: 'Relatórios',  roles: ['admin','gerente'] },
  { href: '/categorias', icon: Tag,             label: 'Categorias',  roles: ['admin','gerente'] },
  { href: '/usuarios',   icon: Shield,          label: 'Usuários',    roles: ['admin'] },
];

function NavItems({ user, router, onClose }) {
  const visible = NAV.filter(n => n.roles.includes(user?.role));
  return (
    <>
      <div className="flex items-center justify-between px-4 py-4 border-b border-dark-600">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-base">🏍</div>
          <div>
            <div className="text-sm font-bold text-white leading-none">MotoGest</div>
            <div className="text-[10px] text-dark-400 mt-0.5">Gestão de Peças</div>
          </div>
        </div>
        {onClose && <button onClick={onClose} className="text-dark-400 hover:text-white p-1 md:hidden"><X size={18}/></button>}
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {visible.map(({ href, icon: Icon, label }) => {
          const active = router.pathname === href || router.pathname.startsWith(href + '/');
          return (
            <Link key={href} href={href}>
              <span className={clsx('flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-all duration-150 text-sm font-medium border',
                active ? 'bg-brand-500/12 text-brand-500 border-brand-500/25' : 'text-dark-300 hover:text-white hover:bg-dark-600 border-transparent')}>
                <Icon size={18} className="flex-shrink-0"/><span>{label}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [router.pathname]);

  const title = NAV.find(n => router.pathname === n.href || router.pathname.startsWith(n.href + '/'))?.label || 'MotoGest';

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[220px] flex-col h-full bg-[#07070f] border-r border-dark-600 flex-shrink-0">
        <NavItems user={user} router={router} />
        <div className="border-t border-dark-600 px-2 py-3">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="w-7 h-7 rounded-lg bg-dark-500 flex items-center justify-center text-xs font-bold text-white">{user?.name?.[0]}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{user?.name}</div>
              <div className="text-[10px] text-dark-400 capitalize">{user?.role}</div>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-2 px-3 py-2 rounded-lg w-full mt-1 text-xs text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <LogOut size={13}/> Sair
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)}/>
          <aside className="relative w-72 h-full bg-[#07070f] border-r border-dark-600 flex flex-col z-10">
            <NavItems user={user} router={router} onClose={() => setOpen(false)}/>
            <div className="border-t border-dark-600 px-2 py-3">
              <div className="flex items-center gap-2 px-2 py-2">
                <div className="w-8 h-8 rounded-lg bg-dark-500 flex items-center justify-center text-sm font-bold text-white">{user?.name?.[0]}</div>
                <div><div className="text-sm font-medium text-white">{user?.name}</div><div className="text-xs text-dark-400 capitalize">{user?.role}</div></div>
              </div>
              <button onClick={logout} className="flex items-center gap-2 px-3 py-2.5 rounded-lg w-full mt-1 text-sm text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <LogOut size={15}/> Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-[#07070f] border-b border-dark-600 flex items-center px-4 gap-3 flex-shrink-0">
          <button onClick={() => setOpen(s => !s)} className="text-dark-300 hover:text-white p-1"><Menu size={20}/></button>
          <div className="flex-1 text-sm font-semibold text-white truncate">{title}</div>
          <div className="hidden sm:block text-xs text-dark-400">{new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</div>
          <Bell size={17} className="text-dark-400"/>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 anim-fade-up" key={router.pathname}>{children}</main>
      </div>
    </div>
  );
}
