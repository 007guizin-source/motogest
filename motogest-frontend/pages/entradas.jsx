import { useState, useRef } from 'react';
import Layout from '../components/Layout';
import { PageHeader, Modal, Field, Badge, Spinner, fmt, fmtDate } from '../components/UI';
import useSWR from 'swr';
import api, { getErrorMessage } from '../lib/api';
import toast from 'react-hot-toast';
import { Plus, Trash2, Search, X, PackagePlus, ChevronDown } from 'lucide-react';

const fetcher = url => api.get(url).then(r => r.data);

export default function EntradasPage() {
  const { data: entries = [], isLoading, mutate } = useSWR('/api/entries', fetcher);
  const { data: products = [] } = useSWR('/api/products?limit=200', fetcher, {
    select: d => d?.data || []
  });
  const { data: suppliers = [] } = useSWR('/api/suppliers', fetcher);

  const [modal, setModal]         = useState(false);
  const [items, setItems]         = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes]         = useState('');
  const [search, setSearch]       = useState('');
  const [results, setResults]     = useState([]);
  const [saving, setSaving]       = useState(false);
  const [detail, setDetail]       = useState(null);
  const searchRef = useRef(null);

  const prodList = (products?.data || products || []);

  const handleSearch = (val) => {
    setSearch(val);
    if (!val || val.length < 2) { setResults([]); return; }
    const q = val.toLowerCase();
    setResults(prodList.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(val))
    ).slice(0, 6));
  };

  const addItem = (p) => {
    setItems(prev => {
      const ex = prev.find(i => i.product_id === p.id);
      if (ex) return prev.map(i => i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product_id: p.id, name: p.name, sku: p.sku, qty: 1, price_buy: p.price_buy || 0 }];
    });
    setSearch(''); setResults([]);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const updateItem = (id, field, val) => {
    setItems(prev => prev.map(i => i.product_id === id ? { ...i, [field]: parseFloat(val) || 0 } : i));
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.product_id !== id));

  const totalCost = items.reduce((s, i) => s + (i.price_buy * i.qty), 0);

  const save = async () => {
    if (!items.length) { toast.error('Adicione ao menos um produto.'); return; }
    setSaving(true);
    try {
      await api.post('/api/entries', {
        items: items.map(i => ({ product_id: i.product_id, qty: i.qty, price_buy: i.price_buy })),
        supplier_id: supplierId || undefined,
        notes,
      });
      toast.success('Entrada registrada! Estoque atualizado.');
      mutate();
      setModal(false);
      setItems([]); setSupplierId(''); setNotes('');
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

  return (
    <div>
      <PageHeader
        title="Entrada de Mercadoria"
        description="Registre as mercadorias recebidas"
        actions={
          <button className="btn-primary" onClick={() => { setModal(true); setItems([]); }}>
            <Plus size={15} /> Nova Entrada
          </button>
        }
      />

      {/* Histórico */}
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
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <PackagePlus size={18} className="text-emerald-400"/>
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm">
                      {e.supplier_name || 'Fornecedor não informado'}
                    </div>
                    <div className="text-xs text-dark-400 mt-0.5">
                      {fmtDate(e.created_at)} · {e.user_name} · {e.item_count} produto(s) · {e.total_qty} unidades
                    </div>
                    {e.notes && <div className="text-xs text-dark-300 mt-1 italic">{e.notes}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-xs text-dark-400">Custo total</div>
                    <div className="font-bold text-brand-500">{fmt(e.total_cost)}</div>
                  </div>
                  <button onClick={() => openDetail(e.id)} className="btn-ghost py-1.5 px-3 text-xs">
                    Ver itens
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
          {/* Busca de produto */}
          <div className="mb-4">
            <Field label="Buscar Produto">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"/>
                <input
                  ref={searchRef}
                  className="input pl-8"
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Nome, SKU ou código de barras..."
                  autoFocus
                />
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
                        <div className="text-xs text-dark-400">{p.sku} · Estoque atual: {p.stock}</div>
                      </div>
                      <div className="text-xs text-brand-500 font-medium">{fmt(p.price_buy)} custo</div>
                    </div>
                  ))}
                </div>
              )}
            </Field>
          </div>

          {/* Itens adicionados */}
          {items.length > 0 && (
            <div className="mb-4 space-y-2">
              {items.map(i => (
                <div key={i.product_id} className="bg-dark-800 rounded-xl p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{i.name}</div>
                    <div className="text-xs text-dark-400">{i.sku}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-[10px] text-dark-400 mb-1">Qtd.</div>
                      <input type="number" min={1} value={i.qty}
                        onChange={e => updateItem(i.product_id, 'qty', e.target.value)}
                        className="input w-16 text-center py-1.5 text-sm"/>
                    </div>
                    <div>
                      <div className="text-[10px] text-dark-400 mb-1">Preço compra</div>
                      <input type="number" step="0.01" min={0} value={i.price_buy}
                        onChange={e => updateItem(i.product_id, 'price_buy', e.target.value)}
                        className="input w-28 py-1.5 text-sm"/>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-dark-400 mb-1">Subtotal</div>
                      <div className="text-sm font-bold text-brand-500">{fmt(i.price_buy * i.qty)}</div>
                    </div>
                    <button onClick={() => removeItem(i.product_id)}
                      className="btn-danger py-1.5 px-2 text-xs mt-4">
                      <X size={12}/>
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 px-1">
                <span className="text-sm text-dark-300">Total da entrada</span>
                <span className="text-lg font-bold text-brand-500">{fmt(totalCost)}</span>
              </div>
            </div>
          )}

          {/* Fornecedor e observações */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Fornecedor (opcional)">
              <select className="input" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">Selecionar...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Observações">
              <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Ex: NF 1234, entrega parcial..."/>
            </Field>
          </div>

          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving || !items.length}>
              {saving ? '⏳ Salvando...' : `✅ Confirmar Entrada${items.length ? ` (${items.length} produto${items.length>1?'s':''})` : ''}`}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Detalhes */}
      {detail && (
        <Modal title="Detalhes da Entrada" onClose={() => setDetail(null)}>
          <div className="text-sm text-dark-300 mb-3">
            {fmtDate(detail.entry.created_at)} · {detail.entry.user_name}
            {detail.entry.supplier_name && ` · ${detail.entry.supplier_name}`}
          </div>
          <div className="space-y-2">
            {detail.items.map(i => (
              <div key={i.id} className="flex justify-between items-center py-2 border-b border-dark-600">
                <div>
                  <div className="text-sm font-medium text-white">{i.product_name}</div>
                  <div className="text-xs text-dark-400">{i.sku} · {i.qty} un. × {fmt(i.price_buy)}</div>
                </div>
                <div className="font-semibold text-brand-500">{fmt(i.price_buy * i.qty)}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-3 mt-1">
            <span className="font-semibold text-white">Total</span>
            <span className="font-bold text-brand-500 text-lg">{fmt(detail.entry.total_cost)}</span>
          </div>
        </Modal>
      )}
    </div>
  );
}

EntradasPage.getLayout = (page) => <Layout>{page}</Layout>;
