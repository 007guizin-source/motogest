import { useState } from 'react';
import Layout from '../../components/Layout';
import { PageHeader, SearchInput, Badge, Table, Modal, Field, StatCard, fmt, Spinner } from '../../components/UI';
import { useCustomers } from '../../hooks/useData';
import { Plus, Pencil, CreditCard } from 'lucide-react';

const EMPTY = { name: '', phone: '', document: '', city: '', credit_limit: '' };

export default function ClientesPage() {
  const [search, setSearch]     = useState('');
  const [debtOnly, setDebtOnly] = useState(false);
  const [modal, setModal]       = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [debtModal, setDebtModal] = useState(null);
  const [debtForm, setDebtForm]   = useState({ type: 'debito', value: '', description: '' });
  const [saving, setSaving]       = useState(false);

  const { customers, isLoading, createCustomer, updateCustomer, postDebt } = useCustomers({
    search: search || undefined,
    withDebt: debtOnly || undefined,
  });

  const set  = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setD = (k) => (e) => setDebtForm(f => ({ ...f, [k]: e.target.value }));

  const openNew  = () => { setForm(EMPTY); setModal('new'); };
  const openEdit = (c) => { setForm({ ...c }); setModal('edit'); };

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      if (modal === 'new') await createCustomer(form);
      else await updateCustomer(form.id, form);
      setModal(null);
    } catch (_) {} finally { setSaving(false); }
  };

  const handleDebt = async () => {
    if (!debtForm.value || parseFloat(debtForm.value) <= 0) return;
    setSaving(true);
    try {
      await postDebt(debtModal.id, debtForm.type, parseFloat(debtForm.value), debtForm.description);
      setDebtModal(null);
      setDebtForm({ type: 'debito', value: '', description: '' });
    } catch (_) {} finally { setSaving(false); }
  };

  const totalDebt = customers.reduce((s, c) => s + Number(c.debt || 0), 0);
  const withDebt  = customers.filter(c => c.debt > 0).length;

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Cadastro e gestão de fiado"
        actions={
          <button className="btn-primary" onClick={openNew}>
            <Plus size={15} /> Novo Cliente
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard icon="👥" label="Total de Clientes" value={customers.length}  color="#60a5fa" />
        <StatCard icon="💳" label="Total em Fiado"    value={fmt(totalDebt)}    color="#f59e0b" />
        <StatCard icon="⚠️" label="Inadimplentes"     value={withDebt}          color="#fb7185" />
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-5">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Nome, telefone ou CPF/CNPJ..." />
        </div>
        <button onClick={() => setDebtOnly(v => !v)}
          className={`btn-ghost ${debtOnly ? 'border-yellow-500/40 text-yellow-400' : ''}`}>
          💳 Com Fiado
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size={24} className="text-dark-400" /></div>
      ) : (
        <Table headers={['Cliente', 'Telefone', 'CPF/CNPJ', 'Cidade', 'Compras', 'Débito', 'Ações']}>
          {customers.map(c => (
            <tr key={c.id} className="table-row">
              <td>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-dark-500 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                    {c.name[0]}
                  </div>
                  <span className="font-medium">{c.name}</span>
                </div>
              </td>
              <td className="text-dark-300">{c.phone || '—'}</td>
              <td className="text-dark-400 text-xs">{c.document || '—'}</td>
              <td className="text-dark-300">{c.city || '—'}</td>
              <td><Badge color="blue">{c.purchase_count || 0} compras</Badge></td>
              <td>
                {c.debt > 0
                  ? <Badge color="yellow">{fmt(c.debt)}</Badge>
                  : <Badge color="green">Sem débito</Badge>}
              </td>
              <td>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(c)} className="btn-ghost py-1.5 px-2.5 text-xs">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => { setDebtModal(c); setDebtForm({ type: 'debito', value: '', description: '' }); }}
                    className="btn-ghost py-1.5 px-2.5 text-xs text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10">
                    <CreditCard size={12} /> Fiado
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* Modal Cliente */}
      {modal && (
        <Modal title={modal === 'new' ? 'Novo Cliente' : 'Editar Cliente'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Nome Completo *">
                <input className="input" value={form.name} onChange={set('name')} />
              </Field>
            </div>
            <Field label="Telefone">
              <input className="input" value={form.phone || ''} onChange={set('phone')} placeholder="(53) 99999-9999" />
            </Field>
            <Field label="CPF / CNPJ">
              <input className="input" value={form.document || ''} onChange={set('document')} />
            </Field>
            <Field label="Cidade">
              <input className="input" value={form.city || ''} onChange={set('city')} />
            </Field>
            <Field label="Limite de Crédito (R$)">
              <input className="input" type="number" value={form.credit_limit ?? ""} placeholder="0,00"
                onChange={e => setForm(f => ({ ...f, credit_limit: parseFloat(e.target.value) || 0 }))} />
            </Field>
            <div className="col-span-2">
              <Field label="Endereço">
                <input className="input" value={form.address || ''} onChange={set('address')} />
              </Field>
            </div>
          </div>
          <div className="flex gap-3 mt-5 justify-end">
            <button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? '⏳ Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Fiado */}
      {debtModal && (
        <Modal title={`Fiado — ${debtModal.name}`} onClose={() => setDebtModal(null)} width="max-w-sm">
          <div className="text-center mb-5">
            <p className="text-xs text-dark-400 mb-1">Débito atual</p>
            <p className={`text-3xl font-bold ${debtModal.debt > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {fmt(debtModal.debt)}
            </p>
          </div>
          <div className="flex gap-2 mb-4">
            {[{ id: 'debito', label: '+ Débito', cls: 'btn-danger' }, { id: 'pagamento', label: '✓ Pagamento', cls: 'btn-primary bg-emerald-500 hover:bg-emerald-600' }].map(t => (
              <button key={t.id}
                onClick={() => setDebtForm(f => ({ ...f, type: t.id }))}
                className={`flex-1 justify-center py-2 text-sm font-medium rounded-lg border transition-all ${
                  debtForm.type === t.id ? t.cls : 'btn-ghost'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <Field label="Valor (R$)">
            <input className="input" type="number" step="0.01"
              value={debtForm.value} onChange={setD('value')} placeholder="0,00" />
          </Field>
          <Field label="Descrição (opcional)">
            <input className="input" value={debtForm.description} onChange={setD('description')} />
          </Field>
          <button className="btn-primary w-full justify-center mt-4 py-3" onClick={handleDebt} disabled={saving}>
            {saving ? '⏳...' : 'Confirmar'}
          </button>
        </Modal>
      )}
    </div>
  );
}

ClientesPage.getLayout = (page) => <Layout>{page}</Layout>;
