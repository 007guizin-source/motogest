import { useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader, Modal, Field, Badge, Table, Spinner } from '../components/UI';
import { useUsers } from '../hooks/useData';
import { Plus, Pencil, KeyRound } from 'lucide-react';

const ROLE_COLOR = { admin: 'orange', gerente: 'blue', caixa: 'green' };

export default function UsuariosPage() {
  const { users, isLoading, createUser, updateUser, resetPassword } = useUsers();
  const [modal, setModal]         = useState(null);
  const [form, setForm]           = useState({ role: 'caixa', active: true });
  const [passModal, setPassModal] = useState(null);
  const [newPass, setNewPass]     = useState('');
  const [saving, setSaving]       = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name || !form.email) return;
    setSaving(true);
    try {
      if (modal === 'new') await createUser({ ...form, password: form.password || 'Mudar123!' });
      else await updateUser(form.id, form);
      setModal(null);
    } catch (_) {} finally { setSaving(false); }
  };

  const doReset = async () => {
    if (newPass.length < 6) return;
    setSaving(true);
    try {
      await resetPassword(passModal.id, newPass);
      setPassModal(null); setNewPass('');
    } catch (_) {} finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Controle de acesso e permissões"
        actions={
          <button className="btn-primary" onClick={() => { setForm({ role: 'caixa', active: true }); setModal('new'); }}>
            <Plus size={15} /> Novo Usuário
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size={24} className="text-dark-400" /></div>
      ) : (
        <Table headers={['Usuário', 'E-mail', 'Cargo', 'Status', 'Último acesso', 'Ações']}>
          {users.map(u => (
            <tr key={u.id} className="table-row">
              <td>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-dark-500 flex items-center justify-center text-sm font-bold text-white">
                    {u.name[0]}
                  </div>
                  <span className="font-medium">{u.name}</span>
                </div>
              </td>
              <td className="text-dark-300 text-xs">{u.email}</td>
              <td><Badge color={ROLE_COLOR[u.role] || 'blue'}>{u.role}</Badge></td>
              <td><Badge color={u.active ? 'green' : 'red'}>{u.active ? 'Ativo' : 'Inativo'}</Badge></td>
              <td className="text-dark-400 text-xs">
                {u.last_action ? new Date(u.last_action).toLocaleDateString('pt-BR') : '—'}
              </td>
              <td>
                <div className="flex gap-2">
                  <button onClick={() => { setForm({ ...u }); setModal('edit'); }}
                    className="btn-ghost py-1.5 px-2.5 text-xs"><Pencil size={12} /></button>
                  <button onClick={() => { setPassModal(u); setNewPass(''); }}
                    className="btn-ghost py-1.5 px-2.5 text-xs text-yellow-400 border-yellow-500/30">
                    <KeyRound size={12} /> Senha
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {modal && (
        <Modal title={modal === 'new' ? 'Novo Usuário' : 'Editar Usuário'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <Field label="Nome *"><input className="input" value={form.name || ''} onChange={set('name')} /></Field>
            <Field label="E-mail *"><input className="input" type="email" value={form.email || ''} onChange={set('email')} /></Field>
            {modal === 'new' && (
              <Field label="Senha (padrão: Mudar123!)">
                <input className="input" type="password" value={form.password || ''} onChange={set('password')} />
              </Field>
            )}
            <Field label="Cargo">
              <select className="input" value={form.role} onChange={set('role')}>
                <option value="caixa">Caixa — apenas PDV</option>
                <option value="gerente">Gerente — produtos, clientes, relatórios</option>
                <option value="admin">Administrador — acesso total</option>
              </select>
            </Field>
            {modal === 'edit' && (
              <Field label="Status">
                <select className="input" value={form.active ? 'true' : 'false'}
                  onChange={e => setForm(f => ({ ...f, active: e.target.value === 'true' }))}>
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </Field>
            )}
          </div>
          <div className="flex gap-3 mt-5 justify-end">
            <button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? '⏳ Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {passModal && (
        <Modal title={`Redefinir Senha — ${passModal.name}`} onClose={() => setPassModal(null)} width="max-w-sm">
          <Field label="Nova Senha (mínimo 6 caracteres)">
            <input className="input" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} />
          </Field>
          <div className="flex gap-3 mt-5 justify-end">
            <button className="btn-ghost" onClick={() => setPassModal(null)}>Cancelar</button>
            <button className="btn-primary" onClick={doReset} disabled={saving || newPass.length < 6}>
              {saving ? '⏳...' : '🔑 Redefinir Senha'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

UsuariosPage.getLayout = (page) => <Layout>{page}</Layout>;
