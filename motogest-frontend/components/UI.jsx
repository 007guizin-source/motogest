import { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';

// ── Spinner ─────────────────────────────────────────────────────
export function Spinner({ size = 16, className = '' }) {
  return <Loader2 size={size} className={clsx('animate-spin', className)} />;
}

// ── Modal ────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, width = 'max-w-xl' }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={clsx('w-full bg-dark-700 border border-dark-500 rounded-2xl max-h-[90vh] overflow-y-auto anim-scale-in', width)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-500">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="btn-ghost px-2 py-2 text-dark-300 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Confirm Dialog ───────────────────────────────────────────────
export function Confirm({ title, message, onConfirm, onClose, loading }) {
  return (
    <Modal title={title} onClose={onClose} width="max-w-sm">
      <div className="text-center py-2">
        <AlertTriangle size={40} className="text-yellow-400 mx-auto mb-3" />
        <p className="text-sm text-dark-300 mb-6">{message}</p>
        <div className="flex gap-3">
          <button className="btn-ghost flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button className="btn-danger flex-1 justify-center" onClick={onConfirm} disabled={loading}>
            {loading ? <Spinner size={14} /> : 'Confirmar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Field ────────────────────────────────────────────────────────
export function Field({ label, required, children, error }) {
  return (
    <div>
      {label && (
        <label className="label">
          {label}{required && <span className="text-brand-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────
export function StatCard({ icon, label, value, sub, color = '#f97316', trend }) {
  return (
    <div className="card relative overflow-hidden cursor-default transition-transform duration-200 hover:-translate-y-1 anim-fade-up">
      <div
        className="absolute top-0 right-0 w-20 h-20 rounded-bl-full"
        style={{ background: `radial-gradient(circle at top right, ${color}20, transparent)` }}
      />
      <div className="flex justify-between items-start mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
          style={{ background: `${color}20`, border: `1px solid ${color}30`, color }}
        >
          {icon}
        </div>
        {trend !== undefined && (
          <span className={clsx('text-xs font-semibold', trend >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-xs text-dark-300">{label}</div>
      {sub && <div className="text-xs text-dark-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────
export function Badge({ color = 'blue', children }) {
  const map = {
    green: 'badge-green', red: 'badge-red', yellow: 'badge-yellow',
    blue: 'badge-blue', orange: 'badge-orange',
  };
  return <span className={map[color] || 'badge-blue'}>{children}</span>;
}

// ── Table ────────────────────────────────────────────────────────
export function Table({ headers, children, empty = 'Nenhum registro encontrado.' }) {
  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full border-collapse">
        <thead className="table-head"><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {!children || (Array.isArray(children) && children.length === 0) ? (
        <div className="text-center py-10 text-dark-300 text-sm">{empty}</div>
      ) : null}
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────
export function Empty({ icon = '📭', title, description, action }) {
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-3">{icon}</div>
      <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
      {description && <p className="text-sm text-dark-300 mb-4">{description}</p>}
      {action}
    </div>
  );
}

// ── Page Header ──────────────────────────────────────────────────
export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="text-sm text-dark-300 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Search Input ─────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Buscar...' }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-300 text-sm">🔍</span>
      <input
        className="input pl-8 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ── Currency format ──────────────────────────────────────────────
export const fmt = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '-';
