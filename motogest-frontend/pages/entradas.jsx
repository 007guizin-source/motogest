import { useState, useRef } from 'react';
import Layout from '../components/Layout';
import { PageHeader, Modal, Field, Spinner, fmt, fmtDate } from '../components/UI';
import useSWR from 'swr';
import api, { getErrorMessage } from '../lib/api';
import toast from 'react-hot-toast';
import { Plus, Trash2, Search, X, PackagePlus, Download, Minus } from 'lucide-react';
import Cookies from 'js-cookie';

const fetcher = url => api.get(url).then(r => r.data);

export default function EntradasPage() {
  const { data: entries = [], isLoading, mutate } = useSWR('/api/entries', fetcher);
  const { data: prodData } = useSWR('/api/products?limit=500', fetcher);
  const prodList = prodData?.data || [];

  const [modal, setModal]   = useState(false);
  const [items, setItems]   = useState([]);
  const [notes, setNotes]   = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const searchRef = useRef(null);

  // Busca por nome ou SKU
  const handleSearch = (val) => {
    setSearch(val);
    if (!val || val.length < 2) { setResults([]); return; }
    const q = val.toLowerCase();
    setResults(prodList.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q)
    ).slice(0, 8));
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

  const changeQty = (id, delta) =>
    setItems(prev => prev.map(i => i.product_id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));

  const setQty = (id, val) =>
    setItems(prev => prev.map(i => i.product_id === id ? { ...i, qty: parseInt(val) || 1 } : i));

  const removeItem = (id) => setItems(prev => prev.filter(i => i.product_id !== id));

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
      setItems([]); setNotes(''); setSearch(''); setResults([]);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const downloadPdf = async (id) => {
    const token = Cookies.get('accessToken');
    const url = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/entries/${id}/pdf`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `entrada-${id.slice(0,8)}.pdf`;
      a.click();
    } catch { toast.error('Erro ao gerar PDF.'); }
  };

  const cancelEntry = async (id) => {
    if (!confirm('Cancelar esta entrada e reverter o estoque?')) return;
    try {
      await api.delete(`/api/entries/${id}`);
      toast.success('Entrada cancelada.');
      mutate();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const openDetail = async (id) => {
    try {
      const { data } = await api.get(`/api/entries/${id}`);
      setDetail(data);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div>
      <PageHeader
        title="Entrada de Mercadoria"
        description="Registre as cargas recebidas e baixe o relatório em PDF"
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
        <div className="space-y-3">
          {entries.map(e => (
            <div key={e.id} className="card">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <PackagePlus size={18} className="text-emerald-400"/>
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm">
                      Carga de {fmtDate(e.created_at)}
                    </div>
                    <div className="text-xs text-dark-400 mt-0.5">
                      {e.item_count} produto(s) · {e.total_qty} unidades · por {e.user_name}
                    </div>
                    {e.notes && <div className="text-xs text-dark-300 mt-0.5 italic">{e.notes}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openDetail(e.id)} className="btn-ghost py-1.5 px-3 text-xs">
                    Ver itens
                  </button>
                  <button onClick={() => downloadPdf(e.id)} className="btn-ghost py-1.5 px-3 text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10">
                    <Download size={13}/> PDF
                  </button>
                  <button onClick={() => cancelEntry(e.id)} className="btn-danger py-1.5 px-2 text-xs">
                    <Trash2 size={12}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nova Entrada */}
      {modal && (
        <Modal title="Nova Entrada de Mercadoria" onClose={() => setModal(false)} width="max-w-2xl">
          <Field label="Buscar Produto por Nome ou SKU">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"/>
              <input ref={searchRef} className="input pl-8" value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Ex: Filtro de óleo ou FLT001" autoFocus/>
              {search && <button onClick={() => { setSearch(''); setResults([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"><X size={14}/></button>}
            </div>
            {results.length > 0 && (
              <div className="mt-1 bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                {results.map(p => (
                  <div key={p.id} onClick={() => addItem(p)}
                    className="flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-dark-700 border-b border-dark-600 last:border-0 transition-colors">
                    <div>
                      <div className="text-sm font-medium text-white">{p.name}</div>
                      <div className="text-xs text-dark-400">{p.sku} · Estoque atual: {p.stock} un.</div>
                    </div>
                    <Plus size={16} className="text-brand-500"/>
                  </div>
                ))}
              </div>
            )}
          </Field>

          {items.length > 0 && (
            <div className="mt-4 mb-4 space-y-2">
              <div className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-2">
                Produtos adicionados ({items.length})
              </div>
              {items.map(i => (
                <div key={i.product_id} className="bg-dark-800 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{i.name}</div>
                    <div className="text-xs text-dark-400">{i.sku}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-xs text-dark-400 mr-1">Qtd. recebida:</div>
                    <button onClick={() => changeQty(i.product_id, -1)}
                      className="w-7 h-7 rounded-lg bg-dark-700 border border-dark-500 flex items-center justify-center text-white hover:bg-dark-600">
                      <Minus size={12}/>
                    </button>
                    <input type="number" min={1} value={i.qty}
                      onChange={e => setQty(i.product_id, e.target.value)}
                      className="input w-16 text-center py-1.5 text-sm font-bold"/>
                    <button onClick={() => changeQty(i.product_id, 1)}
                      className="w-7 h-7 rounded-lg bg-dark-700 border border-dark-500 flex items-center justify-center text-white hover:bg-dark-600">
                      <Plus size={12}/>
                    </button>
                    <button onClick={() => removeItem(i.product_id)}
                      className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white ml-1">
                      <X size={12}/>
                    </button>
                  </div>
                </div>
              ))}
              <div className="text-right text-xs text-dark-400 pt-1">
                Total: <span className="text-white font-semibold">{items.reduce((s,i) => s+i.qty, 0)} unidades</span>
              </div>
            </div>
          )}

          <Field label="Observações (opcional)">
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Ex: NF 1234, entrega parcial, Distribuidora XYZ..."/>
          </Field>

          <div className="flex gap-3 justify-end mt-4">
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving || !items.length}>
              {saving ? '⏳ Salvando...' : `✅ Confirmar Entrada${items.length ? ` (${items.reduce((s,i)=>s+i.qty,0)} un.)` : ''}`}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Detalhes */}
      {detail && (
        <Modal title={`Entrada de ${fmtDate(detail.entry.created_at)}`} onClose={() => setDetail(null)}>
          {detail.entry.notes && (
            <div className="text-sm text-dark-300 mb-4 italic">{detail.entry.notes}</div>
          )}
          <div className="space-y-2 mb-4">
            {detail.items.map(i => (
              <div key={i.id} className="flex justify-between items-center py-2 border-b border-dark-600">
                <div>
                  <div className="text-sm font-medium text-white">{i.product_name}</div>
                  <div className="text-xs text-dark-400">{i.sku}</div>
                </div>
                <div className="font-bold text-emerald-400">+{i.qty} un.</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-sm text-dark-300">Total recebido</span>
            <span className="font-bold text-white">{detail.items.reduce((s,i)=>s+i.qty,0)} unidades</span>
          </div>
          <button onClick={() => downloadPdf(detail.entry.id)}
            className="btn-primary w-full justify-center mt-4">
            <Download size={15}/> Baixar PDF desta Entrada
          </button>
        </Modal>
      )}
    </div>
  );
}

EntradasPage.getLayout = (page) => <Layout>{page}</Layout>;
