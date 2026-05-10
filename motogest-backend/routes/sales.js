const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, audit } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// ─── POST /api/sales ───────────────────────────────────────────
// Criar uma nova venda (PDV)
router.post('/', [
  body('items').isArray({ min: 1 }).withMessage('A venda deve ter ao menos 1 item.'),
  body('items.*.product_id').isUUID(),
  body('items.*.qty').isInt({ min: 1 }),
  body('payment_method').isIn(['dinheiro', 'pix', 'debito', 'credito', 'fiado', 'parcelado']),
  body('discount_pct').optional().isFloat({ min: 0, max: 100 }),
  body('customer_id').optional().isUUID(),
  body('installments').optional().isInt({ min: 1, max: 24 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });
  }

  const {
    items, payment_method, discount_pct = 0,
    customer_id, installments = 1, notes,
  } = req.body;

  // ── Verifica estoque e busca preços dentro de uma transação ──
  const result = await db.withTransaction(async (client) => {
    // Travar os produtos para evitar race conditions
    const productIds = items.map(i => i.product_id);
    const { rows: products } = await client.query(
      `SELECT id, name, price_sell, price_buy, stock
       FROM products
       WHERE id = ANY($1::uuid[])
       FOR UPDATE`,
      [productIds]
    );

    const productMap = {};
    products.forEach(p => { productMap[p.id] = p; });

    // Validar estoque de cada item
    for (const item of items) {
      const p = productMap[item.product_id];
      if (!p) throw Object.assign(new Error(`Produto não encontrado: ${item.product_id}`), { status: 404 });
      if (p.stock < item.qty) {
        throw Object.assign(
          new Error(`Estoque insuficiente para "${p.name}". Disponível: ${p.stock}`),
          { status: 409 }
        );
      }
    }

    // Calcular totais
    let subtotal = 0;
    const enrichedItems = items.map(item => {
      const p = productMap[item.product_id];
      const lineTotal = p.price_sell * item.qty;
      subtotal += lineTotal;
      return { ...item, price_unit: p.price_sell, price_buy: p.price_buy, subtotal: lineTotal };
    });

    const discountAmt = subtotal * (discount_pct / 100);
    const total = subtotal - discountAmt;

    // Criar venda
    const { rows: [sale] } = await client.query(`
      INSERT INTO sales
        (customer_id, user_id, subtotal, discount_pct, discount_amt, total, payment_method, installments, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [customer_id || null, req.user.id, subtotal, discount_pct, discountAmt,
        total, payment_method, installments, notes || null]);

    // Inserir itens (o trigger de estoque dispara aqui automaticamente)
    for (const item of enrichedItems) {
      await client.query(`
        INSERT INTO sale_items (sale_id, product_id, qty, price_unit, price_buy, subtotal)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [sale.id, item.product_id, item.qty, item.price_unit, item.price_buy, item.subtotal]);
    }

    return { sale, items: enrichedItems };
  });

  await audit(db, {
    userId: req.user.id, action: 'create_sale', entity: 'sales',
    entityId: result.sale.id,
    details: { total: result.sale.total, items: items.length },
    ip: req.ip,
  });

  res.status(201).json({
    sale: result.sale,
    items: result.items,
  });
}));

// ─── GET /api/sales ────────────────────────────────────────────
router.get('/', [
  query('start').optional().isDate(),
  query('end').optional().isDate(),
  query('customer_id').optional().isUUID(),
  query('payment_method').optional().isString(),
  query('page').optional().isInt({ min: 1 }).default(1),
  query('limit').optional().isInt({ min: 1, max: 100 }).default(30),
], asyncHandler(async (req, res) => {
  const { start, end, customer_id, payment_method, page = 1, limit = 30 } = req.query;
  const offset = (page - 1) * limit;

  const conds = ["s.status = 'completed'"];
  const params = [];

  if (start) { params.push(start); conds.push(`s.created_at::date >= $${params.length}`); }
  if (end)   { params.push(end);   conds.push(`s.created_at::date <= $${params.length}`); }
  if (customer_id) { params.push(customer_id); conds.push(`s.customer_id = $${params.length}`); }
  if (payment_method) { params.push(payment_method); conds.push(`s.payment_method = $${params.length}`); }

  const where = 'WHERE ' + conds.join(' AND ');
  params.push(limit, offset);

  const { rows } = await db.query(`
    SELECT
      s.id, s.number, s.subtotal, s.discount_pct, s.total,
      s.payment_method, s.installments, s.status, s.created_at,
      c.name as customer_name,
      u.name as user_name,
      COUNT(si.id) as item_count
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN sale_items si ON si.sale_id = s.id
    ${where}
    GROUP BY s.id, c.name, u.name
    ORDER BY s.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  res.json(rows);
}));

// ─── GET /api/sales/summary ────────────────────────────────────
// Resumo financeiro para o dashboard
router.get('/summary', asyncHandler(async (req, res) => {
  const { rows: [summary] } = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN created_at::date = CURRENT_DATE THEN total END), 0)              as today,
      COALESCE(SUM(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()) THEN total END), 0) as this_month,
      COALESCE(SUM(CASE WHEN DATE_TRUNC('year', created_at) = DATE_TRUNC('year', NOW()) THEN total END), 0)  as this_year,
      COUNT(CASE WHEN created_at::date = CURRENT_DATE THEN 1 END)                             as today_count,
      COUNT(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()) THEN 1 END) as month_count
    FROM sales WHERE status = 'completed'
  `);

  res.json(summary);
}));

// ─── GET /api/sales/daily ──────────────────────────────────────
// Vendas por dia para gráfico (últimos N dias)
router.get('/daily', [
  query('days').optional().isInt({ min: 7, max: 365 }).default(30),
], asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;

  const { rows } = await db.query(`
    SELECT
      d::date as date,
      COALESCE(SUM(s.total), 0)  as revenue,
      COALESCE(SUM(s.total - COALESCE(
        (SELECT SUM(si.price_buy * si.qty) FROM sale_items si WHERE si.sale_id = s.id), 0
      )), 0) as profit,
      COUNT(s.id) as sale_count
    FROM generate_series(
      CURRENT_DATE - INTERVAL '1 day' * ($1::int - 1),
      CURRENT_DATE,
      '1 day'
    ) AS d
    LEFT JOIN sales s ON s.created_at::date = d AND s.status = 'completed'
    GROUP BY d
    ORDER BY d ASC
  `, [days]);

  res.json(rows);
}));

// ─── GET /api/sales/:id ────────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows: [sale] } = await db.query(`
    SELECT s.*, c.name as customer_name, u.name as user_name
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.id = $1
  `, [req.params.id]);

  if (!sale) return res.status(404).json({ error: 'Venda não encontrada.' });

  const { rows: items } = await db.query(`
    SELECT si.*, p.name as product_name, p.sku
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = $1
  `, [req.params.id]);

  res.json({ sale, items });
}));

// ─── POST /api/sales/:id/cancel ───────────────────────────────
router.post('/:id/cancel', authorize('admin', 'gerente'), asyncHandler(async (req, res) => {
  await db.withTransaction(async (client) => {
    const { rows: [sale] } = await client.query(
      "SELECT * FROM sales WHERE id = $1 AND status = 'completed'",
      [req.params.id]
    );
    if (!sale) throw Object.assign(new Error('Venda não encontrada ou já cancelada.'), { status: 404 });

    // Reverter estoque
    const { rows: items } = await client.query(
      'SELECT * FROM sale_items WHERE sale_id = $1', [req.params.id]
    );

    for (const item of items) {
      await client.query(
        'UPDATE products SET stock = stock + $1 WHERE id = $2',
        [item.qty, item.product_id]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, user_id, type, qty, reason, ref_id)
         VALUES ($1,$2,'devolucao',$3,'Cancelamento de venda',$4)`,
        [item.product_id, req.user.id, item.qty, sale.id]
      );
    }

    // Cancelar venda e estornar financeiro
    await client.query("UPDATE sales SET status = 'cancelled' WHERE id = $1", [req.params.id]);
    await client.query(
      `INSERT INTO financial_transactions (type, description, value, category, ref_id, user_id)
       VALUES ('saida', $1, $2, 'Estorno', $3, $4)`,
      [`Cancelamento Venda #${sale.number}`, sale.total, sale.id, req.user.id]
    );

    // Se era fiado, reverter dívida
    if (sale.payment_method === 'fiado' && sale.customer_id) {
      await client.query(
        'UPDATE customers SET debt = GREATEST(0, debt - $1) WHERE id = $2',
        [sale.total, sale.customer_id]
      );
    }
  });

  await audit(db, {
    userId: req.user.id, action: 'cancel_sale', entity: 'sales',
    entityId: req.params.id, ip: req.ip,
  });

  res.json({ message: 'Venda cancelada e estoque revertido.' });
}));

module.exports = router;
