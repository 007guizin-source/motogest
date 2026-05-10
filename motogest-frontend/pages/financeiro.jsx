// ============================================================
// pages/financeiro.jsx
// ============================================================
import Layout from '../components/Layout';
import { PageHeader, StatCard, Modal, Field, fmt, fmtDate, Spinner, Badge } from '../components/UI';
import { useFinancialSummary, useCashflow, useTransactions } from '../hooks/useData';
import { Plus, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function FinanceiroPage() {
  const [period, setPeriod]   = useState('month');
  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState({ type: 'entrada', category: 'Despesas' });
  const [saving, setSaving]   = useState(false);

  const { data: summary }     = useFinancialSummary(period);
  const { data: cashflow }    = useCashflow(30);
  const { transactions, isLoading, createTransaction, deleteTransaction } = useTransactions();

  const set  = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.description || !form.value) return;
    setSaving(true);
    try { await createTransaction({ ...form, value: parseFloat(form.value) }); setModal(false); }
    catch (_) {} finally { setSaving(false); }
  };

  const chartData = (cashflow || []).slice(-14).map(d => ({
    dia:      new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Entradas: Number(d.income),
    Saídas:   Number(d.expense),
  }));

  const PERIODS = [
    { id: 'day', label: 'Hoje' }, { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mês' }, { id: 'year', label: 'Ano' },
  ];

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Entradas, saídas e fluxo de caixa"
        actions={
          <button className="btn-primary" onClick={() => setModal(true)}>
            <Plus size={15} /> Lançamento
          </button>
        }
      />

      {/* Período */}
      <div className="flex gap-2 mb-5">
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`btn-ghost text-xs py-1.5 px-3 ${period === p.id ? 'border-brand-500/40 text-brand-500' : ''}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard icon="📈" label="Entradas" value={fmt(summary?.summary?.total_in)}    color="#10d9a0" />
        <StatCard icon="📉" label="Saídas"   value={fmt(summary?.summary?.total_out)}   color="#fb7185" />
        <StatCard icon="💰" label="Saldo"    value={fmt(summary?.summary?.balance)}
          color={Number(summary?.summary?.balance) >= 0 ? '#f97316' : '#fb7185'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico */}
        <div className="card">
          <p className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-4">
            Fluxo de Caixa — 14 Dias
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="dia" tick={{ fill: '#3a3a58', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#3a3a58', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: '#101020', border: '1px solid #1e1e36', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="Entradas" fill="#10d9a0" radius={[3,3,0,0]} />
              <Bar dataKey="Saídas"   fill="#fb7185" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Lançamentos */}
        <div className="card">
          <p className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-3">Lançamentos Recentes</p>
          {isLoading ? <Spinner className="text-dark-400 mx-auto mt-6" /> : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {transactions.slice(0, 20).map(tx => (
                <div key={tx.id} className="flex items-center gap-3 p-2.5 bg-dark-800 rounded-lg">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    tx.type === 'entrada' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                  }`}>
                    {tx.type === 'entrada' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{tx.description}</p>
                    <p className="text-xs text-dark-400">{fmtDate(tx.date)} · {tx.category}</p>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${tx.type === 'entrada' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {tx.type === 'entrada' ? '+' : '-'}{fmt(tx.value)}
                  </p>
                  <button onClick={() => deleteTransaction(tx.id)}
                    className="text-dark-400 hover:text-red-400 transition-colors ml-1">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal title="Novo Lançamento" onClose={() => setModal(false)} width="max-w-md">
          <div className="flex gap-2 mb-4">
            {[['entrada','📈 Entrada'], ['saida','📉 Saída']].map(([id, label]) => (
              <button key={id} onClick={() => setForm(f => ({ ...f, type: id }))}
                className={`flex-1 justify-center py-2 text-sm font-medium rounded-lg border transition-all ${
                  form.type === id
                    ? id === 'entrada' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-red-500/15 border-red-500/30 text-red-400'
                    : 'btn-ghost'
                }`}>{label}</button>
            ))}
          </div>
          <Field label="Descrição"><input className="input" value={form.description || ''} onChange={set('description')} /></Field>
          <Field label="Valor (R$)"><input className="input mt-3" type="number" step="0.01" value={form.value || ''} onChange={set('value')} /></Field>
          <Field label="Categoria">
            <select className="input mt-3" value={form.category} onChange={set('category')}>
              {['Vendas','Compras','Despesas','Recebimentos','Outros'].map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <div className="flex gap-3 mt-5 justify-end">
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '⏳...' : '💾 Salvar'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

FinanceiroPage.getLayout = (page) => <Layout>{page}</Layout>;
export default FinanceiroPage;
