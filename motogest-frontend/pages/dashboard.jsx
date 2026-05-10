import Layout from '../components/Layout';
import { StatCard, Badge, fmt, fmtDate } from '../components/UI';
import { useSalesSummary, useSalesDaily, useLowStock, useCustomers } from '../hooks/useData';
import { Spinner } from '../components/UI';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

const PIE_COLORS = ['#f97316','#60a5fa','#10d9a0','#f59e0b','#a78bfa'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-xs">
      <p className="text-dark-300 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const { data: summary, isLoading: ls } = useSalesSummary();
  const { data: daily,   isLoading: ld } = useSalesDaily(14);
  const { data: lowStock }               = useLowStock();
  const { customers }                    = useCustomers({ withDebt: true });

  const debtTotal = customers.reduce((s, c) => s + Number(c.debt || 0), 0);

  const chartData = (daily || []).map((d) => ({
    dia:    d.date ? new Date(d.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) : d.dia,
    Vendas: Number(d.revenue || 0),
    Lucro:  Number(d.profit  || 0),
  }));

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {ls ? Array(5).fill(0).map((_, i) => (
          <div key={i} className="card flex items-center justify-center h-28">
            <Spinner className="text-dark-400" />
          </div>
        )) : <>
          <StatCard icon="💵" label="Vendas Hoje"       value={fmt(summary?.today)}      trend={8}  color="#f97316" />
          <StatCard icon="📅" label="Vendas no Mês"     value={fmt(summary?.this_month)} trend={12} color="#60a5fa" />
          <StatCard icon="🏆" label="Vendas no Ano"     value={fmt(summary?.this_year)}  trend={5}  color="#10d9a0" />
          <StatCard icon="🛒" label="Vendas Hoje (qtd)" value={summary?.today_count ?? 0}           color="#f59e0b" />
          <StatCard icon="💳" label="Fiado Pendente"    value={fmt(debtTotal)} sub={`${customers.length} clientes`} color="#fb7185" />
        </>}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Line chart */}
        <div className="card lg:col-span-2">
          <div className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-4">
            Vendas e Lucro — Últimos 14 Dias
          </div>
          {ld ? (
            <div className="h-48 flex items-center justify-center"><Spinner className="text-dark-400" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gVendas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f97316" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gLucro" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10d9a0" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10d9a0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="dia" tick={{ fill: '#3a3a58', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#3a3a58', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Vendas" stroke="#f97316" fill="url(#gVendas)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Lucro"  stroke="#10d9a0" fill="url(#gLucro)"  strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie */}
        <div className="card">
          <div className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-4">
            Vendas por Categoria
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={[
                { name: 'Motor', value: 32 }, { name: 'Pneus', value: 28 },
                { name: 'Elétrica', value: 15 }, { name: 'Transmissão', value: 12 },
                { name: 'Outros', value: 13 },
              ]} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" strokeWidth={0}>
                {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
              </Pie>
              <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: '#101020', border: '1px solid #1e1e36', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {['Motor','Pneus','Elétrica','Transmissão','Outros'].map((l, i) => (
              <div key={l} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: PIE_COLORS[i] }} />
                <span className="text-dark-300 flex-1">{l}</span>
                <span className="text-white font-medium">{[32,28,15,12,13][i]}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Low stock */}
        <div className="card">
          <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">
            ⚠️ Estoque Crítico
          </div>
          {!lowStock?.length ? (
            <p className="text-dark-400 text-sm">Nenhum produto com estoque crítico. ✓</p>
          ) : (
            <div className="space-y-2">
              {(lowStock || []).slice(0, 6).map((p) => (
                <div key={p.id} className="flex justify-between items-center py-1.5 border-b border-dark-600">
                  <div>
                    <p className="text-sm font-medium text-white leading-tight">{p.name}</p>
                    <p className="text-xs text-dark-400">{p.sku} · {p.location}</p>
                  </div>
                  <Badge color={p.stock === 0 ? 'red' : 'yellow'}>{p.stock} un.</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Debts */}
        <div className="card">
          <div className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-3">
            💳 Fiado Pendente
          </div>
          {!customers.length ? (
            <p className="text-dark-400 text-sm">Nenhum cliente com débito. ✓</p>
          ) : (
            <div className="space-y-2">
              {customers.slice(0, 6).map((c) => (
                <div key={c.id} className="flex justify-between items-center py-1.5 border-b border-dark-600">
                  <div>
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-dark-400">{c.phone}</p>
                  </div>
                  <Badge color="yellow">{fmt(c.debt)}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

DashboardPage.getLayout = (page) => <Layout>{page}</Layout>;
