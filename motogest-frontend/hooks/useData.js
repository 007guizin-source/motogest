import useSWR from 'swr';
import api, { getErrorMessage } from '../lib/api';
import toast from 'react-hot-toast';

// ── Fetcher padrão para SWR ─────────────────────────────────────
const fetcher = (url) => api.get(url).then((r) => r.data);

// ── PRODUTOS ────────────────────────────────────────────────────
export function useProducts(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
  ).toString();

  const { data, error, mutate, isLoading } = useSWR(
    `/api/products${query ? `?${query}` : ''}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const createProduct = async (body) => {
    try {
      const { data: created } = await api.post('/api/products', body);
      mutate();
      toast.success('Produto criado!');
      return created;
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  const updateProduct = async (id, body) => {
    try {
      const { data: updated } = await api.put(`/api/products/${id}`, body);
      mutate();
      toast.success('Produto atualizado!');
      return updated;
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  const deleteProduct = async (id) => {
    try {
      await api.delete(`/api/products/${id}`);
      mutate();
      toast.success('Produto removido.');
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  const adjustStock = async (id, qty, type, reason) => {
    try {
      const { data: res } = await api.put(`/api/products/${id}/stock`, { qty, type, reason });
      mutate();
      toast.success(`Estoque atualizado: ${res.stock} un.`);
      return res;
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  return {
    products: data?.data || [],
    pagination: data?.pagination,
    isLoading,
    isError: !!error,
    mutate,
    createProduct,
    updateProduct,
    deleteProduct,
    adjustStock,
  };
}

export function useLowStock() {
  return useSWR('/api/products/low-stock', fetcher, { refreshInterval: 60000 });
}

export function useCategories() {
  return useSWR('/api/products/categories', fetcher, { revalidateOnFocus: false });
}

// ── VENDAS ──────────────────────────────────────────────────────
export function useSalesSummary() {
  return useSWR('/api/sales/summary', fetcher, { refreshInterval: 30000 });
}

export function useSalesDaily(days = 30) {
  return useSWR(`/api/sales/daily?days=${days}`, fetcher, { revalidateOnFocus: false });
}

export function useSales(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v)
  ).toString();
  return useSWR(`/api/sales${query ? `?${query}` : ''}`, fetcher, { revalidateOnFocus: false });
}

export async function createSale(body) {
  try {
    const { data } = await api.post('/api/sales', body);
    toast.success(`Venda #${data.sale.number} finalizada!`);
    return data;
  } catch (err) { toast.error(getErrorMessage(err)); throw err; }
}

export async function cancelSale(id) {
  try {
    await api.post(`/api/sales/${id}/cancel`);
    toast.success('Venda cancelada.');
  } catch (err) { toast.error(getErrorMessage(err)); throw err; }
}

// ── CLIENTES ────────────────────────────────────────────────────
export function useCustomers(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v)
  ).toString();

  const { data, error, mutate, isLoading } = useSWR(
    `/api/customers${query ? `?${query}` : ''}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const createCustomer = async (body) => {
    try {
      const { data: created } = await api.post('/api/customers', body);
      mutate(); toast.success('Cliente cadastrado!'); return created;
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  const updateCustomer = async (id, body) => {
    try {
      const { data: updated } = await api.put(`/api/customers/${id}`, body);
      mutate(); toast.success('Cliente atualizado!'); return updated;
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  const postDebt = async (id, type, value, description) => {
    try {
      const { data: res } = await api.post(`/api/customers/${id}/debt`, { type, value, description });
      mutate();
      toast.success(type === 'pagamento' ? 'Pagamento registrado!' : 'Débito adicionado.');
      return res;
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  return {
    customers: Array.isArray(data) ? data : [],
    isLoading, isError: !!error, mutate,
    createCustomer, updateCustomer, postDebt,
  };
}

// ── FINANCEIRO ──────────────────────────────────────────────────
export function useFinancialSummary(period = 'month') {
  return useSWR(`/api/financial/summary?period=${period}`, fetcher, { refreshInterval: 60000 });
}

export function useCashflow(days = 30) {
  return useSWR(`/api/financial/cashflow?days=${days}`, fetcher, { revalidateOnFocus: false });
}

export function useTransactions(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v)
  ).toString();

  const { data, error, mutate, isLoading } = useSWR(
    `/api/financial${query ? `?${query}` : ''}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const createTransaction = async (body) => {
    try {
      const { data: tx } = await api.post('/api/financial', body);
      mutate(); toast.success('Lançamento registrado!'); return tx;
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  const deleteTransaction = async (id) => {
    try {
      await api.delete(`/api/financial/${id}`);
      mutate(); toast.success('Lançamento removido.');
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  return {
    transactions: Array.isArray(data) ? data : [],
    isLoading, isError: !!error, mutate,
    createTransaction, deleteTransaction,
  };
}

// ── USUÁRIOS ────────────────────────────────────────────────────
export function useUsers() {
  const { data, error, mutate, isLoading } = useSWR('/api/users', fetcher);

  const createUser = async (body) => {
    try {
      const { data: u } = await api.post('/api/users', body);
      mutate(); toast.success('Usuário criado!'); return u;
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  const updateUser = async (id, body) => {
    try {
      const { data: u } = await api.put(`/api/users/${id}`, body);
      mutate(); toast.success('Usuário atualizado!'); return u;
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  const resetPassword = async (id, newPassword) => {
    try {
      await api.put(`/api/users/${id}/reset-password`, { newPassword });
      toast.success('Senha redefinida!');
    } catch (err) { toast.error(getErrorMessage(err)); throw err; }
  };

  return {
    users: Array.isArray(data) ? data : [],
    isLoading, isError: !!error, mutate,
    createUser, updateUser, resetPassword,
  };
}
