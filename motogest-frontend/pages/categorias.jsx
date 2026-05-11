import { useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader, Modal, Field, Spinner } from '../components/UI';
import useSWR from 'swr';
import api, { getErrorMessage } from '../lib/api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const fetcher = url => api.get(url).then(r => r.data);

export default function CategoriasPage() {
  const { isAdmin, isGerente } = useAuth();
  const { data: cats = [], isLoading, mutate } = useSWR('/api/categories', fetcher);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '' });
  const [delId, setDelId] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (modal === 'new') {
        await api.post('/api/categories', { name: form.name });
        toast.success('Categoria criada!');
      } else {
        await api.put(`/api/categories/${form.id}`, { name: form.name });
        toast.success('Categoria atualizada!');
      }
      mutate();
      setModal(null);
      setForm({ name: '' });
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const del = async () => {
    try {
      await api.delete(`/api/categories/${delId}`);
      toast.success('Categoria removida.');
      mutate();
      setDelId(null);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div>
      <PageHeader
        title="Categorias"
        description="Gerencie as categorias de produtos"
        actions={isGerente && (
          <button className="btn-primary" onClick={() => { setForm({ name: '' }); setModal('new'); }}>
            <Plus size={15} /> Nova Categoria
          </button>
        )}
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size={24} className="text-dark-400" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cats.map(c => (
            <div key={c.id} className="card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                <Tag size={18} className="text-brand-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white text-sm">{c.name}</div>
                <div className="text-xs text-dark-400 mt-0.5">{c.product_count} produto(s)</div>
              </div>
              {isGerente && (
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => { setForm({ id: c.id, name: c.name }); setModal('edit'); }}
                    className="btn-ghost py-1.5 px-2.5 text-xs">
                    <Pencil size={12} />
                  </button>
                  {isAdmin && (
                    <button onClick={() => setDelId(c.id)}
                      className="btn-danger py-1.5 px-2.5 text-xs">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'new' ? 'Nova Categoria' : 'Editar Categoria'} onClose={() => setModal(null)} width="max-w-sm">
          <Field label="Nome da Categoria *">
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Escapamentos" onKeyDown={e => e.key === 'Enter' && save()} autoFocus />
          </Field>
          <div className="flex gap-3 mt-5 justify-end">
            <button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? '⏳ Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {delId && (
        <Modal title="Excluir Categoria" onClose={() => setDelId(null)} width="max-w-sm">
          <div className="text-center py-2">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-sm text-dark-300 mb-6">
              Categorias com produtos não podem ser excluídas.<br/>Tem certeza que deseja excluir?
            </p>
            <div className="flex gap-3 justify-center">
              <button className="btn-ghost" onClick={() => setDelId(null)}>Cancelar</button>
              <button className="btn-danger" onClick={del}>🗑 Excluir</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

CategoriasPage.getLayout = (page) => <Layout>{page}</Layout>;
