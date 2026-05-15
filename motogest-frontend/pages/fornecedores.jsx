import { useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader, Modal, Field, Spinner } from '../components/UI';
import useSWR from 'swr';
import api, { getErrorMessage } from '../lib/api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, ExternalLink, Phone, FileText, Link } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const fetcher = url => api.get(url).then(r => r.data);

const EMPTY = { name: '', url: '', phone: '', notes: '' };

export default function FornecedoresPage() {
  const { isAdmin, isGerente } = useAuth();
  const { data: suppliers = [], isLoading, mutate } = useSWR('/api/suppliers', fetcher);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [delId, setDelId] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const openNew  = () => { setForm(EMPTY); setModal('new'); };
  const openEdit = s => { setForm({ ...s }); setModal('edit'); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (modal === 'new') {
        await api.post('/api/suppliers', form);
        toast.success('Fornecedor adicionado!');
      } else {
        await api.put(`/api/suppliers/${form.id}`, form);
        toast.success('Fornecedor atualizado!');
      }
      mutate(); setModal(null); setForm(EMPTY);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const del = async () => {
    try {
      await api.delete(`/api/suppliers/${delId}`);
      toast.success('Fornecedor removido.');
      mutate(); setDelId(null);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const formatUrl = url => {
    if (!url) return null;
    return url.startsWith('http') ? url : `https://${url}`;
  };

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        description="Links e contatos dos seus fornecedores"
        actions={isGerente && (
          <button className="btn-primary" onClick={openNew}>
            <Plus size={15} /> Novo Fornecedor
          </button>
        )}
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size={24} className="text-dark-400" /></div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🏭</div>
          <h3 className="text-base font-semibold text-white mb-2">Nenhum fornecedor cadastrado</h3>
          <p className="text-sm text-dark-400 mb-4">Adicione seus fornecedores para acessar os links rapidamente.</p>
          {isGerente && <button className="btn-primary" onClick={openNew}><Plus size={15}/> Adicionar Fornecedor</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {suppliers.map(s => (
            <div key={s.id} className="card flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center flex-shrink-0 text-lg">
                    🏭
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-white text-sm truncate">{s.name}</div>
                    {s.phone && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Phone size={11} className="text-dark-400 flex-shrink-0"/>
                        <span className="text-xs text-dark-400 truncate">{s.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
                {isGerente && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => openEdit(s)} className="btn-ghost py-1.5 px-2 text-xs">
                      <Pencil size={12}/>
                    </button>
                    {isAdmin && (
                      <button onClick={() => setDelId(s.id)} className="btn-danger py-1.5 px-2 text-xs">
                        <Trash2 size={12}/>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Notes */}
              {s.notes && (
                <div className="flex items-start gap-2 bg-dark-800 rounded-lg px-3 py-2">
                  <FileText size={13} className="text-dark-400 mt-0.5 flex-shrink-0"/>
                  <span className="text-xs text-dark-300 leading-relaxed">{s.notes}</span>
                </div>
              )}

              {/* Link */}
              {s.url && (
                <a href={formatUrl(s.url)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2.5 text-brand-500 hover:bg-brand-500/20 transition-colors">
                  <ExternalLink size={14} className="flex-shrink-0"/>
                  <span className="text-sm font-medium truncate">Abrir site do fornecedor</span>
                </a>
              )}

              {!s.url && (
                <div className="flex items-center gap-2 bg-dark-800 rounded-lg px-3 py-2.5 text-dark-400">
                  <Link size={13} className="flex-shrink-0"/>
                  <span className="text-xs">Sem link cadastrado</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal title={modal === 'new' ? 'Novo Fornecedor' : 'Editar Fornecedor'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <Field label="Nome do Fornecedor *">
              <input className="input" value={form.name} onChange={set('name')}
                placeholder="Ex: Distribuidora Honda" autoFocus/>
            </Field>
            <Field label="Link / Site">
              <input className="input" value={form.url} onChange={set('url')}
                placeholder="Ex: www.distribuidora.com.br"/>
            </Field>
            <Field label="Telefone / WhatsApp">
              <input className="input" value={form.phone} onChange={set('phone')}
                placeholder="Ex: (53) 99999-9999"/>
            </Field>
            <Field label="Observações">
              <textarea className="input resize-none" rows={3} value={form.notes} onChange={set('notes')}
                placeholder="Ex: Mínimo de compra R$ 500, entrega em 3 dias..."/>
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
        <Modal title="Excluir Fornecedor" onClose={() => setDelId(null)} width="max-w-sm">
          <div className="text-center py-2">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-sm text-dark-300 mb-6">Tem certeza que deseja remover este fornecedor?</p>
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

FornecedoresPage.getLayout = (page) => <Layout>{page}</Layout>;
