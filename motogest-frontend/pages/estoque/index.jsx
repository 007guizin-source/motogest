import { useState } from 'react';
import Layout from '../../components/Layout';
import { PageHeader, SearchInput, Badge, Table, Modal, Field, Confirm, fmt, Spinner } from '../../components/UI';
import { useProducts, useCategories } from '../../hooks/useData';
import { Plus, Pencil, Trash2 } from 'lucide-react';

// Campos numéricos começam vazios
const EMPTY_FORM = { cat: 'Motor', stock_min: '', stock: '', price_buy: '', price_sell: '' };

export default function EstoquePage() {
  const [search, setSearch]   = useState('');
  const [cat, setCat]         = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [modal, setModal]     = useState(null);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [delId, setDelId]     = useState(null);
  const [saving, setSaving]   = useState(false);

  const { products, isLoading, createProduct, updateProduct, deleteProduct } = useProducts({
    search, category: cat, lowStock: lowOnly || undefined,
  });
  const { data: categories = [] } = useCategories();

  const set  = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setN = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value })); // guarda como string, converte no save

  const openNew  = () => { setForm(EMPTY_FORM); setModal('new'); };
  const openEdit = (p) => {
    setForm({
      ...p,
      price_buy:  p.price_buy  === 0 ? '' : p.price_buy,
      price_sell: p.price_sell === 0 ? '' : p.price_sell,
      stock:      p.stock      === 0 ? '' : p.stock,
      stock_min:  p.stock_min  === 0 ? '' : p.stock_min,
    });
    setModal('edit');
  };

  const save = async () => {
    if (!form.name || !form.price_sell) return;
    const payload = {
      ...form,
      price_buy:  parseFloat(form.price_buy)  || 0,
      price_sell: parseFloat(form.price_sell) || 0,
      stock:      parseInt(form.stock)        || 0,
      stock_min:  parseInt(form.stock_min)    || 0,
      sku: form.sku || `SKU${Date.now()}`,
    };
    setSaving(true);
    try {
      if (modal === 'new') await createProduct(payload);
      else await updateProduct(form.id, payload);
      setModal(null);
    } catch (_) {}
    finally { setSaving(false); }
  };

  const confirmDel = async () => { await deleteProduct(delId); setDelId(null); };
  const stockColor = (p) => p.stock === 0 ? 'red' : p.stock <= p.stock_min ? 'yellow' : 'green';

  return (
    <div>
      <PageHeader
        title="Estoque"
        description="Gestão de produtos e inventário"
        actions={<button className="btn-primary" onClick={openNew}><Plus size={15}/> Novo Produto</button>}
      />

      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="flex-1 min-w-48">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome, SKU ou código..."/>
        </div>
        <select className="input w-48" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => setLowOnly(v => !v)}
          className={`btn-ghost ${lowOnly ? 'border-yellow-500/40 text-yellow-400' : ''}`}>
          ⚠️ Crítico
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size={24} className="text-dark-400"/></div>
      ) : (
        <Table headers={['SKU','Produto','Categoria','Estoque','P. Compra','P. Venda','Margem','Ações']}>
          {products.map(p => {
            const margin = p.price_buy > 0
              ? (((p.price_sell - p.price_buy) / p.price_buy) * 100).toFixed(0) : 0;
            return (
              <tr key={p.id} className="table-row">
                <td><code className="text-xs bg-dark-600 px-2 py-0.5 rounded text-dark-300">{p.sku}</code></td>
                <td>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-dark-400">{p.brand} · {p.model} · {p.location}</p>
                </td>
                <td><Badge color="blue">{p.category_name}</Badge></td>
                <td>
                  <div className="flex items-center gap-2">
                    <Badge color={stockColor(p)}>{p.stock} un.</Badge>
                    <span className="text-xs text-dark-400">mín: {p.stock_min}</span>
                  </div>
                </td>
                <td className="text-dark-300">{fmt(p.price_buy)}</td>
                <td className="text-brand-500 font-semibold">{fmt(p.price_sell)}</td>
                <td><Badge color={margin > 50 ? 'green' : margin > 30 ? 'yellow' : 'red'}>{margin}%</Badge></td>
                <td>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(p)} className="btn-ghost py-1.5 px-2.5 text-xs">
                      <Pencil size={12}/> Editar
                    </button>
                    <button onClick={() => setDelId(p.id)} className="btn-danger py-1.5 px-2.5 text-xs">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      {modal && (
        <Modal title={modal === 'new' ? 'Novo Produto' : 'Editar Produto'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Nome *">
                <input className="input" value={form.name || ''} onChange={set('name')} placeholder="Ex: Filtro de Óleo Honda CG 150"/>
              </Field>
            </div>
            <Field label="SKU"><input className="input" value={form.sku || ''} onChange={set('sku')} placeholder="FLT001"/></Field>
            <Field label="Código de Barras"><input className="input" value={form.barcode || ''} onChange={set('barcode')} placeholder="7891234560001"/></Field>
            <Field label="Categoria">
              <select className="input" value={form.category_id || ''} onChange={set('category_id')}>
                <option value="">Selecionar...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Marca"><input className="input" value={form.brand || ''} onChange={set('brand')}/></Field>
            <Field label="Modelo / Compatibilidade"><input className="input" value={form.model || ''} onChange={set('model')}/></Field>
            <Field label="Localização (ex: A-01)"><input className="input" value={form.location || ''} onChange={set('location')}/></Field>
            <Field label="Preço de Compra (R$)">
              <input className="input" type="number" step="0.01" min="0"
                value={form.price_buy ?? ''} placeholder="0,00" onChange={setN('price_buy')} placeholder="0,00"/>
            </Field>
            <Field label="Preço de Venda (R$) *">
              <input className="input" type="number" step="0.01" min="0"
                value={form.price_sell ?? ''} placeholder="0,00" onChange={setN('price_sell')} placeholder="0,00"/>
            </Field>
            {modal === 'new' && (
              <Field label="Estoque Inicial">
                <input className="input" type="number" min="0"
                  value={form.stock ?? ''} placeholder="0" onChange={setN('stock')} placeholder="0"/>
              </Field>
            )}
            <Field label="Estoque Mínimo">
              <input className="input" type="number" min="0"
                value={form.stock_min ?? ''} placeholder="5" onChange={setN('stock_min')} placeholder="5"/>
            </Field>
          </div>
          <div className="flex gap-3 mt-5 justify-end">
            <button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? '⏳ Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {delId && (
        <Confirm
          title="Excluir Produto"
          message="O produto será desativado. O histórico de vendas é preservado."
          onClose={() => setDelId(null)}
          onConfirm={confirmDel}
        />
      )}
    </div>
  );
}

EstoquePage.getLayout = (page) => <Layout>{page}</Layout>;
