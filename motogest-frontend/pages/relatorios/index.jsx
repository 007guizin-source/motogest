import Layout from '../../components/Layout';
import { PageHeader } from '../../components/UI';
import { Download } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const REPORTS = [
  {
    title: 'Relatório de Vendas',
    desc: 'Todas as vendas do período com totais, descontos e lucro.',
    icon: '📊',
    routes: [
      { label: 'PDF',   href: `${API}/api/reports/sales/pdf`,   params: true },
      { label: 'Excel', href: `${API}/api/reports/sales/excel`, params: true },
    ],
  },
  {
    title: 'Produtos Mais Vendidos',
    desc: 'Ranking por receita gerada no período.',
    icon: '🏆',
    routes: [
      { label: 'PDF', href: `${API}/api/reports/products/pdf`, params: true },
    ],
  },
  {
    title: 'Estoque Completo',
    desc: 'Inventário com margens, custo e valor total em estoque.',
    icon: '📦',
    routes: [
      { label: 'PDF',   href: `${API}/api/reports/stock/pdf`,   params: false },
      { label: 'Excel', href: `${API}/api/reports/stock/excel`, params: false },
    ],
  },
  {
    title: 'Fiado / Inadimplência',
    desc: 'Clientes com débito em aberto.',
    icon: '💳',
    routes: [
      { label: 'PDF', href: `${API}/api/reports/debts/pdf`, params: false },
    ],
  },
];

export default function RelatoriosPage() {
  const today    = new Date().toISOString().split('T')[0];
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0];

  const token = typeof window !== 'undefined'
    ? document.cookie.match(/accessToken=([^;]+)/)?.[1]
    : '';

  const download = (href, needsParams) => {
    const url = needsParams ? `${href}?start=${firstDay}&end=${today}` : href;
    // Abre com token no header via fetch + blob
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = href.split('/').pop() + (href.includes('pdf') ? '.pdf' : '.xlsx');
        a.click();
      })
      .catch(() => window.open(url, '_blank'));
  };

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Exporte relatórios em PDF e Excel"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <div key={r.title} className="card hover:-translate-y-1 transition-transform duration-200">
            <div className="text-3xl mb-3">{r.icon}</div>
            <h3 className="text-base font-semibold text-white mb-1">{r.title}</h3>
            <p className="text-sm text-dark-300 mb-4">{r.desc}</p>
            <div className="flex gap-2 flex-wrap">
              {r.routes.map((route) => (
                <button
                  key={route.label}
                  onClick={() => download(route.href, route.params)}
                  className="btn-ghost text-xs py-1.5 px-3"
                >
                  <Download size={12} /> Exportar {route.label}
                </button>
              ))}
            </div>
            {r.routes.some(rt => rt.params) && (
              <p className="text-xs text-dark-400 mt-3">
                Período padrão: mês atual ({firstDay} → {today})
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

RelatoriosPage.getLayout = (page) => <Layout>{page}</Layout>;
