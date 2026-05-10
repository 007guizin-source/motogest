import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, ShoppingCart, Package, Users, DollarSign,
  BarChart2, Shield, Settings, LogOut, Menu, Bell, ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';

const NAV = [
  { href: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard',    roles: ['admin','gerente','caixa'] },
  { href: '/pdv',        icon: ShoppingCart,    label: 'Caixa / PDV',  roles: ['admin','gerente','caixa'] },
  { href: '/estoque',    icon: Package,         label: 'Estoque',      roles: ['admin','gerente'] },
  { href: '/clientes',   icon: Users,           label: 'Clientes',     roles: ['admin','gerente','caixa'] },
  { href: '/financeiro', icon: DollarSign,      label: 'Financeiro',   roles: ['admin','gerente'] },
  { href: '/relatorios', icon: BarChart2,       label: 'Relatórios',   roles: ['admin','gerente'] },
  { href: '/usuarios',   icon: Shield,          label: 'Usuários',     roles: ['admin'] },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const visibleNav = NAV.filter(n => n.roles.includes(user?.role));

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside
        className={clsx(
          'flex flex-col h-full transition-all duration-250 flex-shrink-0 z-10',
          'bg-[#07070f] border-r border-dark-600',
          collapsed ? 'w-[60px]' : 'w-[220px]'
        )}
      >
        {/* Logo */}
        <div className={clsx(
          'flex items-center gap-2.5 border-b border-dark-600',
          collapsed ? 'px-3 py-4 justify-center' : 'px-4 py-4'
        )}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-base flex-shrink-0">
            🏍
          </div>
          {!collapsed && (
            <div>
              <div className="text-sm font-bold text-white leading-none">MotoGest</div>
              <div className="text-[10px] text-dark-400 mt-0.5">Gestão de Peças</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map(({ href, icon: Icon, label }) => {
            const active = router.pathname === href || router.pathname.startsWith(href + '/');
            return (
              <Link key={href} href={href}>
                <span className={clsx(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150',
                  'text-sm font-medium',
                  active
                    ? 'bg-brand-500/12 text-brand-500 border border-brand-500/25'
                    : 'text-dark-300 hover:text-white hover:bg-dark-600 border border-transparent',
                  collapsed && 'justify-center'
                )}>
                  <Icon size={16} className="flex-shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-dark-600 px-2 py-3">
          <div className={clsx(
            'flex items-center gap-2 px-2 py-2 rounded-lg',
            collapsed && 'justify-center'
          )}>
            <div className="w-7 h-7 rounded-lg bg-dark-500 flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
              {user?.name?.[0] || '?'}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white truncate">{user?.name}</div>
                <div className="text-[10px] text-dark-400 capitalize">{user?.role}</div>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg w-full mt-1',
              'text-xs text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150',
              collapsed && 'justify-center'
            )}
          >
            <LogOut size={14} className="flex-shrink-0" />
            {!collapsed && 'Sair'}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-[#07070f] border-b border-dark-600 flex items-center px-5 gap-3 flex-shrink-0">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="btn-ghost border-none px-2 py-2 text-dark-300"
          >
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <div className="text-xs text-dark-400">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
          <button className="btn-ghost border-none px-2 py-2 text-dark-300 relative">
            <Bell size={16} />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 anim-fade-up">
          {children}
        </main>
      </div>
    </div>
  );
}
