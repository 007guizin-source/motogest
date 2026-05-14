import { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { fmt } from '../components/UI';
import { useProducts } from '../hooks/useData';
import { createSale } from '../hooks/useData';
import { Minus, Plus, X, CheckCircle, Printer } from 'lucide-react';
import toast from 'react-hot-toast';

const METHODS = [
  { id: 'dinheiro', icon: '💵', label: 'Dinheiro' },
  { id: 'pix',      icon: '📱', label: 'PIX' },
  { id: 'debito',   icon: '💳', label: 'Débito' },
  { id: 'credito',  icon: '🏦', label: 'Crédito' },
  { id: 'fiado',    icon: '📋', label: 'Fiado' },
];

export default function PDVPage() {
  const { products, mutate: mutateProducts } = useProducts({ limit: 200 });
  const [search, setSearch]     = useState('');
  const [results, setResults]   = useState([]);
  const [cart, setCart]         = useState([]);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod]     = useState('dinheiro');
  const [paid, setPaid]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [receipt, setReceipt]   = useState(null);
  const inputRef = useRef(null);

  // Auto-foco no input
  useEffect(() => { inputRef.current?.focus(); }, []);

  const scanTimer = useRef(null);

  // Busca de produtos
  useEffect(() => {
    if (!search || search.length < 2) { setResults([]); return; }
    const q = search.toLowerCase();
    const r = products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(search))
    ).slice(0, 6);
    setResults(r);

    // Timer: leitora digita tudo em <50ms, aguarda 80ms de silêncio e adiciona
    if (scanTimer.current) clearTimeout(scanTimer.current);
    if (search.length >= 4) {
      scanTimer.current = setTimeout(() => {
        const val = search.trim();
        const byBarcode = products.find(p => p.barcode === val);
        if (byBarcode) { addItem(byBarcode); return; }
        const bySku = products.find(p => p.sku.toLowerCase() === val.toLowerCase());
        if (bySku) { addItem(bySku); return; }
        if (r.length === 1) { addItem(r[0]); }
      }, 80);
    }
  }, [search, products]);

  // Enter manual também funciona
  const handleSearchKey = (e) => {
    if (e.key !== 'Enter') return;
    if (scanTimer.current) clearTimeout(scanTimer.current);
    const val = search.trim();
    const byBarcode = products.find(p => p.barcode === val);
    if (byBarcode) { addItem(byBarcode); return; }
    const bySku = products.find(p => p.sku.toLowerCase() === val.toLowerCase());
    if (bySku) { addItem(bySku); return; }
    if (results.length === 1) { addItem(results[0]); }
  };

  const addItem = (p) => {
    if (p.stock <= 0) { toast.error(`Sem estoque: ${p.name}`); return; }
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) {
        if (ex.qty >= p.stock) { toast.error('Quantidade máxima em estoque!'); return prev; }
        return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...p, qty: 1 }];
    });
    setSearch(''); setResults([]);
    inputRef.current?.focus();
  };

  const changeQty = (id, delta) => setCart(prev =>
    prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
  );
  const removeItem = (id) => setCart(prev => prev.filter(i => i.id !== id));
  const clearCart  = () => { setCart([]); setDiscount(0); setPaid(''); };

  const subtotal  = cart.reduce((s, i) => s + Number(i.price_sell) * i.qty, 0);
  const total     = subtotal * (1 - discount / 100);
  const change    = parseFloat(paid || 0) - total;

  const finalize = async () => {
    if (!cart.length) return;
    setLoading(true);
    try {
      const data = await createSale({
        items: cart.map(i => ({ product_id: i.id, qty: i.qty })),
        payment_method: method,
        discount_pct: discount,
      });
      setReceipt({ ...data.sale, items: cart, total, method });
      setCart([]); setDiscount(0); setPaid('');
      mutateProducts();
    } catch (_) {
      // erro já tratado no hook
    } finally { setLoading(false); }
  };

  // Tela de comprovante
  if (receipt) return (
    <div className="max-w-sm mx-auto pt-6 anim-fade-up">
      <div className="card text-center">
        <CheckCircle size={48} className="text-emerald-400 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-white mb-1">Venda Finalizada!</h2>
        <p className="text-sm text-dark-300 mb-6">Comprovante #{receipt.number}</p>
        <div className="bg-dark-800 rounded-xl p-4 mb-5 text-left space-y-2">
          {receipt.items.map(i => (
            <div key={i.id} className="flex justify-between text-sm">
              <span className="text-dark-300">{i.qty}× {i.name}</span>
              <span className="text-white">{fmt(Number(i.price_sell) * i.qty)}</span>
            </div>
          ))}
          <div className="border-t border-dark-600 pt-2 mt-2 flex justify-between">
            <span className="font-semibold text-dark-300">Total</span>
            <span className="font-bold text-brand-500 text-lg">{fmt(receipt.total)}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="btn-ghost flex-1 justify-center" onClick={() => window.print()}>
            <Printer size={14} /> Imprimir
          </button>
          <button className="btn-primary flex-1 justify-center" onClick={() => setReceipt(null)}>
            Nova Venda
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full -m-6 overflow-hidden">
      {/* ── Esquerda: busca + carrinho ── */}
      <div className="flex-1 flex flex-col gap-4 p-5 overflow-y-auto border-r border-dark-600">
        {/* Busca */}
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-dark-300 uppercase tracking-wider mb-2">
            🔍 Buscar Produto / Código de Barras (F2)
          </p>
          <div className="relative">
            <input
              ref={inputRef}
              className="input pr-8"
              value={search}
              onChange={handleSearchChange} onKeyDown={handleSearchKey}
              placeholder="Nome, SKU ou código de barras..."
            />
            {search && (
              <button onClick={() => { setSearch(''); setResults([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
          {results.length > 0 && (
            <div className="mt-2 bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
              {results.map(p => (
                <div key={p.id} onClick={() => addItem(p)}
                  className="flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-dark-700 border-b border-dark-600 last:border-0 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-white">{p.name}</p>
                    <p className="text-xs text-dark-400">{p.sku} · Estoque: {p.stock}</p>
                  </div>
                  <p className="text-sm font-bold text-brand-500">{fmt(p.price_sell)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Carrinho */}
        <div className="card p-4 flex-1">
          <p className="text-[11px] font-semibold text-dark-300 uppercase tracking-wider mb-3">
            🛒 Carrinho ({cart.length} {cart.length === 1 ? 'item' : 'itens'})
          </p>
          {cart.length === 0 ? (
            <div className="text-center py-10 text-dark-400 text-sm">
              Busque um produto acima para adicionar ao carrinho.
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map(i => (
                <div key={i.id} className="flex items-center gap-3 p-3 bg-dark-800 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{i.name}</p>
                    <p className="text-xs text-dark-400 mt-0.5">
                      {fmt(i.price_sell)} × {i.qty} =
                      <span className="text-brand-500 font-semibold ml-1">{fmt(Number(i.price_sell) * i.qty)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => changeQty(i.id, -1)}
                      className="w-7 h-7 rounded-lg bg-dark-700 border border-dark-500 flex items-center justify-center text-white hover:bg-dark-600 transition-colors">
                      <Minus size={12} />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold text-white">{i.qty}</span>
                    <button onClick={() => changeQty(i.id, 1)}
                      className="w-7 h-7 rounded-lg bg-dark-700 border border-dark-500 flex items-center justify-center text-white hover:bg-dark-600 transition-colors">
                      <Plus size={12} />
                    </button>
                    <button onClick={() => removeItem(i.id)}
                      className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white transition-colors ml-1">
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Direita: totais + pagamento ── */}
      <div className="w-72 flex flex-col gap-4 p-5 overflow-y-auto bg-[#07070f]">
        {/* Resumo */}
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-dark-300 uppercase tracking-wider mb-3">💵 Resumo</p>
          <div className="flex justify-between text-sm mb-3">
            <span className="text-dark-300">Subtotal</span>
            <span className="text-white">{fmt(subtotal)}</span>
          </div>
          <div className="mb-3">
            <label className="label">Desconto (%)</label>
            <input className="input" type="number" min={0} max={100}
              value={discount} onChange={e => setDiscount(Number(e.target.value))} />
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm mb-2">
              <span className="text-red-400">− Desconto</span>
              <span className="text-red-400">−{fmt(subtotal * discount / 100)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-3 border-t border-dark-600">
            <span className="text-base font-bold text-white">TOTAL</span>
            <span className="text-2xl font-bold text-brand-500">{fmt(total)}</span>
          </div>
        </div>

        {/* Formas de pagamento */}
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-dark-300 uppercase tracking-wider mb-3">💳 Pagamento</p>
          <div className="space-y-1.5">
            {METHODS.map(m => (
              <button key={m.id} onClick={() => setMethod(m.id)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  method === m.id
                    ? 'bg-brand-500/12 border-brand-500/30 text-brand-500 font-semibold'
                    : 'bg-transparent border-transparent text-dark-300 hover:bg-dark-600 hover:text-white'
                }`}>
                <span>{m.icon}</span>
                <span>{m.label}</span>
                {method === m.id && <span className="ml-auto text-brand-500">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Troco */}
        {method === 'dinheiro' && (
          <div className="card p-4">
            <label className="label">Valor Recebido (R$)</label>
            <input className="input mb-2" type="number" step="0.01"
              value={paid} onChange={e => setPaid(e.target.value)} placeholder="0,00" />
            {parseFloat(paid || 0) >= total && total > 0 && (
              <div className="flex justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <span className="text-emerald-400 text-sm">Troco</span>
                <span className="text-emerald-400 font-bold">{fmt(change)}</span>
              </div>
            )}
          </div>
        )}

        {/* Botões */}
        <button
          className="btn-primary justify-center py-4 text-base w-full"
          disabled={cart.length === 0 || loading}
          onClick={finalize}
        >
          {loading ? '⏳ Processando...' : '✅ Finalizar Venda'}
        </button>
        <button className="btn-ghost justify-center w-full" onClick={clearCart}>
          🗑 Cancelar Venda
        </button>
      </div>
    </div>
  );
}

PDVPage.getLayout = (page) => <Layout>{page}</Layout>;
