import { useState, useRef } from 'react';
import Layout from '../components/Layout';
import { PageHeader, Modal, Field, Spinner, fmtDate } from '../components/UI';
import useSWR from 'swr';
import api, { getErrorMessage } from '../lib/api';
import toast from 'react-hot-toast';
import { Plus, X, Search, Download, PackagePlus, Trash2 } from 'lucide-react';

const fetcher = url => api.get(url).then(r => r.data);

export default function EntradasPage() {
  const { data: entries = [], isLoading, mutate } = useSWR('/api/entries', fetcher);
  const { data: prodData }  = useSWR('/api/products?limit=500', fetcher);
  const products = prodData?.data || [];

  const [modal, setModal]   = useState(false);
  const [items, setItems]   = useState([]);
  const [notes, setNotes]   = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const searchRef = useRef(null);

  // Busca simples por nome ou SKU
  const handleSearch = (val) => {
    setSearch(val);
    if (!val || val.length < 2) { setResults([]); return; }
    const q = val.toLowerCase();
    setResults(
      products.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
      ).slice(0, 8)
    );
  };

  const addItem = (p) => {
    setItems(prev => {
      const ex = prev.find(i => i.product_id === p.id);
      if (ex) return prev.map(i => i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product_id: p.id, name: p.name, sku: p.sku, qty: 1 }];
    });
    setSearch(''); setResults([]);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const setQty = (id, val) => {
    const n = parseInt(val) || 1;
    setItems(prev => prev.map(i => i.product_id === id ? { ...i, qty: Math.max(1, n) } : i));
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.product_id !== id));

  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  const save = async () => {
    if (!items.length) { toast.error('Adicione ao menos um produto.'); return; }
    setSaving(true);
    try {
      await api.post('/api/entries', {
        items: items.map(i => ({ product_id: i.product_id, qty: i.qty, price_buy: 0 })),
        notes,
      });
      toast.success('Entrada registrada! Estoque atualizado.');
      mutate();
      setModal(false);
      setItems([]); setNotes('');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const cancelEntry = async (id) => {
    if (!confirm('Cancelar esta entrada e reverter o estoque?')) return;
    try {
      await api.delete(`/api/entries/${id}`);
      toast.success('Entrada cancelada e estoque revertido.');
      mutate();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const openDetail = async (id) => {
    try {
      const { data } = await api.get(`/api/entries/${id}`);
      setDetail(data);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  // Download PDF de uma entrada específica
  const downloadPDF = async (entryId) => {
    try {
      const token = document.cookie.match(/accessToken=([^;]+)/)?.[1] || '';
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const r = await fetch(`${API}/api/entries/${entryId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) { toast.error('Erro ao gerar PDF.'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `entrada-${entryId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Erro ao baixar PDF.'); }
  };

  // Agrupar entradas por data
  const grouped = entries.reduce((acc, e) => {
    const d = new Date(e.created_at).toLocaleDateString('pt-BR');
    if (!acc[d]) acc[d] = [];
    acc[d].push(e);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Entrada de Mercadoria"
        description="Registre as mercadorias recebidas e exporte relatórios"
        actions={
          <button className="btn-primary" onClick={() => { setModal(true); setItems([]); setNotes(''); }}>
            <Plus size={15}/> Nova Entrada
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size={24} className="text-dark-400"/></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📦</div>
          <h3 className="text-base font-semibold text-white mb-2">Nenhuma entrada registrada</h3>
          <p className="text-sm text-dark-400 mb-4">Registre a chegada de mercadorias para atualizar o estoque.</p>
          <button className="btn-primary" onClick={() => setModal(true)}><Plus size={15}/> Nova Entrada</button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dayEntries]) => (
            <div key={date}>
              {/* Data como separador */}
              <div className="flex items-center gap-3 mb-3">
                <div className="text-xs font-semibold text-dark-400 uppercase tracking-wider">{date}</div>
                <div className="flex-1 h-px bg-dark-600"/>
                <div className="text-xs text-dark-400">{dayEntries.length} entrada(s)</div>
              </div>

              <div className="space-y-2">
                {dayEntries.map(e => (
                  <div key={e.id} className="card flex items-center gap-4 flex-wrap">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <PackagePlus size={16} className="text-emerald-400"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">
                        {e.item_count} produto(s) · {e.total_qty} unidades no total
                      </div>
                      <div className="text-xs text-dark-400">
                        {new Date(e.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        {e.user_name ? ` · ${e.user_name}` : ''}
                        {e.notes ? ` · ${e.notes}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => openDetail(e.id)} className="btn-ghost py-1.5 px-3 text-xs">
                        Ver itens
                      </button>
                      <button onClick={() => downloadPDF(e.id)} className="btn-ghost py-1.5 px-3 text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10">
                        <Download size={13}/> PDF
                      </button>
                      <button onClick={() => cancelEntry(e.id)} className="btn-danger py-1.5 px-2 text-xs">
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nova Entrada */}
      {modal && (
        <Modal title="Nova Entrada de Mercadoria" onClose={() => setModal(false)} width="max-w-xl">
          <Field label="Buscar Produto por Nome ou SKU">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"/>
              <input
                ref={searchRef}
                className="input pl-8"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Digite o nome ou SKU do produto..."
                autoFocus
              />
              {search && (
                <button onClick={() => { setSearch(''); setResults([]); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white">
                  <X size={14}/>
                </button>
              )}
            </div>

            {results.length > 0 && (
              <div className="mt-1 bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                {results.map(p => (
                  <div key={p.id} onClick={() => addItem(p)}
                    className="flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-dark-700 border-b border-dark-600 last:border-0 transition-colors">
                    <div>
                      <div className="text-sm font-medium text-white">{p.name}</div>
                      <div className="text-xs text-dark-400">SKU: {p.sku} · Estoque atual: {p.stock} un.</div>
                    </div>
                    <div className="text-xs text-brand-500 font-semibold">+ Adicionar</div>
                  </div>
                ))}
              </div>
            )}
          </Field>

          {/* Lista de itens */}
          {items.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">
                Produtos adicionados ({items.length})
              </div>
              {items.map(i => (
                <div key={i.product_id} className="flex items-center gap-3 bg-dark-800 rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{i.name}</div>
                    <div className="text-xs text-dark-400">SKU: {i.sku}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <label className="text-xs text-dark-400">Qtd:</label>
                    <input
                      type="number" min={1} value={i.qty}
                      onChange={e => setQty(i.product_id, e.target.value)}
                      className="input w-20 text-center py-1.5 text-sm"
                    />
                    <button onClick={() => removeItem(i.product_id)}
                      className="btn-danger py-1.5 px-2 text-xs">
                      <X size={12}/>
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex justify-between items-center pt-2 px-1">
                <span className="text-sm text-dark-400">Total de unidades</span>
                <span className="text-base font-bold text-white">{totalQty} un.</span>
              </div>
            </div>
          )}

          <div className="mt-4">
            <Field label="Observação (opcional)">
              <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Ex: NF 1234, entrega da distribuidora..."/>
            </Field>
          </div>

          <div className="flex gap-3 mt-5 justify-end">
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving || !items.length}>
              {saving ? '⏳ Salvando...' : `✅ Confirmar Entrada${items.length ? ` (${items.length} item${items.length > 1 ? 's' : ''})` : ''}`}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Detalhes */}
      {detail && (
        <Modal title="Detalhes da Entrada" onClose={() => setDetail(null)} width="max-w-md">
          <div className="text-sm text-dark-300 mb-4">
            {fmtDate(detail.entry.created_at)} · {detail.entry.user_name}
            {detail.entry.notes && <span className="block text-xs mt-1 italic">{detail.entry.notes}</span>}
          </div>
          <div className="space-y-2">
            {detail.items.map(i => (
              <div key={i.id} className="flex justify-between items-center py-2.5 border-b border-dark-600">
                <div>
                  <div className="text-sm font-medium text-white">{i.product_name}</div>
                  <div className="text-xs text-dark-400">SKU: {i.sku}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-white">+{i.qty} un.</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-3 mt-1">
            <span className="text-sm text-dark-300">Total de unidades</span>
            <span className="font-bold text-white text-base">
              {detail.items.reduce((s, i) => s + i.qty, 0)} un.
            </span>
          </div>
          <div className="mt-4">
            <button onClick={() => downloadPDF(detail.entry.id)}
              className="btn-primary w-full justify-center">
              <Download size={15}/> Baixar PDF desta entrada
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

EntradasPage.getLayout = (page) => <Layout>{page}</Layout>;
