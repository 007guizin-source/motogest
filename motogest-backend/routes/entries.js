const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// Criar tabela se não existir
db.query(`
  CREATE TABLE IF NOT EXISTS stock_entries (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    notes       TEXT,
    total_cost  NUMERIC(10,2) DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

db.query(`
  CREATE TABLE IF NOT EXISTS stock_entry_items (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id    UUID NOT NULL REFERENCES stock_entries(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id),
    qty         INTEGER NOT NULL,
    price_buy   NUMERIC(10,2) NOT NULL DEFAULT 0
  )
`).catch(() => {});

// GET /api/entries — listar entradas recentes
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT
      e.id, e.notes, e.total_cost, e.created_at,
      s.name as supplier_name,
      u.name as user_name,
      COUNT(ei.id) as item_count,
      SUM(ei.qty) as total_qty
    FROM stock_entries e
    LEFT JOIN suppliers s ON s.id = e.supplier_id
    LEFT JOIN users u ON u.id = e.user_id
    LEFT JOIN stock_entry_items ei ON ei.entry_id = e.id
    GROUP BY e.id, s.name, u.name
    ORDER BY e.created_at DESC
    LIMIT 50
  `);
  res.json(rows);
}));

// GET /api/entries/:id — detalhes de uma entrada
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows: [entry] } = await db.query(`
    SELECT e.*, s.name as supplier_name, u.name as user_name
    FROM stock_entries e
    LEFT JOIN suppliers s ON s.id = e.supplier_id
    LEFT JOIN users u ON u.id = e.user_id
    WHERE e.id = $1
  `, [req.params.id]);

  if (!entry) return res.status(404).json({ error: 'Entrada não encontrada.' });

  const { rows: items } = await db.query(`
    SELECT ei.*, p.name as product_name, p.sku
    FROM stock_entry_items ei
    JOIN products p ON p.id = ei.product_id
    WHERE ei.entry_id = $1
  `, [req.params.id]);

  res.json({ entry, items });
}));

// POST /api/entries — registrar entrada de mercadoria
router.post('/', authorize('admin', 'gerente'), [
  body('items').isArray({ min: 1 }).withMessage('Ao menos 1 item obrigatório.'),
  body('items.*.product_id').isUUID(),
  body('items.*.qty').isInt({ min: 1 }),
  body('items.*.price_buy').isFloat({ min: 0 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });

  const { items, supplier_id, notes } = req.body;

  const result = await db.withTransaction(async (client) => {
    const totalCost = items.reduce((s, i) => s + (i.price_buy * i.qty), 0);

    // Criar cabeçalho da entrada
    const { rows: [entry] } = await client.query(`
      INSERT INTO stock_entries (user_id, supplier_id, notes, total_cost)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [req.user.id, supplier_id || null, notes || null, totalCost]);

    // Inserir itens e atualizar estoque
    for (const item of items) {
      await client.query(`
        INSERT INTO stock_entry_items (entry_id, product_id, qty, price_buy)
        VALUES ($1, $2, $3, $4)
      `, [entry.id, item.product_id, item.qty, item.price_buy]);

      // Atualizar estoque e preço de compra
      await client.query(`
        UPDATE products
        SET stock = stock + $1,
            price_buy = $2
        WHERE id = $3
      `, [item.qty, item.price_buy, item.product_id]);

      // Registrar no histórico de movimentações
      await client.query(`
        INSERT INTO stock_movements (product_id, user_id, type, qty, reason, ref_id)
        VALUES ($1, $2, 'entrada', $3, 'Entrada de mercadoria', $4)
      `, [item.product_id, req.user.id, item.qty, entry.id]);

      // Lançar no financeiro
      await client.query(`
        INSERT INTO financial_transactions (type, description, value, category, user_id, ref_id)
        VALUES ('saida', $1, $2, 'Compras', $3, $4)
      `, [`Compra de estoque`, item.price_buy * item.qty, req.user.id, entry.id]);
    }

    return entry;
  });

  res.status(201).json(result);
}));

// DELETE /api/entries/:id — cancelar entrada (reverte estoque)
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  await db.withTransaction(async (client) => {
    const { rows: items } = await client.query(
      'SELECT * FROM stock_entry_items WHERE entry_id = $1', [req.params.id]
    );
    if (!items.length) throw Object.assign(new Error('Entrada não encontrada.'), { status: 404 });

    for (const item of items) {
      await client.query(
        'UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2',
        [item.qty, item.product_id]
      );
    }

    await client.query('DELETE FROM stock_entries WHERE id = $1', [req.params.id]);
  });

  res.json({ message: 'Entrada cancelada e estoque revertido.' });
}));

module.exports = router;
