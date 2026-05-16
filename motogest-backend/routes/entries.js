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

// GET /api/entries/:id/pdf — relatório PDF da entrada
router.get('/:id/pdf', asyncHandler(async (req, res) => {
  const PDFDocument = require('pdfkit');

  const { rows: [entry] } = await db.query(`
    SELECT e.*, s.name as supplier_name, u.name as user_name
    FROM stock_entries e
    LEFT JOIN suppliers s ON s.id = e.supplier_id
    LEFT JOIN users u ON u.id = e.user_id
    WHERE e.id = $1
  `, [req.params.id]);

  if (!entry) return res.status(404).json({ error: 'Entrada não encontrada.' });

  const { rows: items } = await db.query(`
    SELECT ei.qty, p.name as product_name, p.sku, p.location
    FROM stock_entry_items ei
    JOIN products p ON p.id = ei.product_id
    WHERE ei.entry_id = $1
    ORDER BY p.name ASC
  `, [req.params.id]);

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const date = new Date(entry.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="entrada-${req.params.id.slice(0,8)}.pdf"`);
  doc.pipe(res);

  // Cabeçalho
  doc.fontSize(22).fillColor('#f97316').text('MotoGest', 50, 45);
  doc.fontSize(11).fillColor('#666').text('Sistema de Gestão — Loja de Moto Peças', 50, 72);
  doc.moveTo(50, 90).lineTo(545, 90).strokeColor('#f97316').lineWidth(2).stroke();

  doc.fontSize(16).fillColor('#111').text('Relatório de Entrada de Mercadoria', 50, 105);
  doc.fontSize(11).fillColor('#444').text(`Data: ${date}`, 50, 128);
  doc.text(`Registrado por: ${entry.user_name || '-'}`, 50, 144);
  if (entry.supplier_name) doc.text(`Fornecedor: ${entry.supplier_name}`, 50, 160);
  if (entry.notes) doc.text(`Obs: ${entry.notes}`, 50, entry.supplier_name ? 176 : 160);

  // Tabela
  const startY = 210;
  const rowH = 24;
  const cols = [50, 80, 340, 430, 545];

  // Header
  doc.rect(50, startY, 495, rowH).fill('#f97316');
  doc.fontSize(10).fillColor('#fff');
  doc.text('#',       cols[0]+4, startY+7, { width: cols[1]-cols[0]-8 });
  doc.text('SKU',     cols[1]+4, startY+7, { width: cols[2]-cols[1]-8 });
  doc.text('Produto', cols[2]+4, startY+7, { width: cols[3]-cols[2]-8 });
  doc.text('Local',   cols[3]+4, startY+7, { width: cols[4]-cols[3]-8, align: 'center' });

  // Adicionar coluna QTD
  const cols2 = [50, 80, 310, 410, 470, 545];
  doc.rect(50, startY, 495, rowH).fill('#f97316');
  doc.fontSize(9).fillColor('#fff');
  doc.text('#',        cols2[0]+4, startY+7, { width: 26 });
  doc.text('SKU',      cols2[1]+4, startY+7, { width: cols2[2]-cols2[1]-8 });
  doc.text('Produto',  cols2[2]+4, startY+7, { width: cols2[3]-cols2[2]-8 });
  doc.text('Local',    cols2[3]+4, startY+7, { width: cols2[4]-cols2[3]-8, align: 'center' });
  doc.text('Qtd',      cols2[4]+4, startY+7, { width: cols2[5]-cols2[4]-8, align: 'right' });

  let y = startY + rowH;
  items.forEach((item, idx) => {
    if (y > 720) { doc.addPage(); y = 50; }
    doc.rect(50, y, 495, rowH).fill(idx % 2 === 0 ? '#f9f9f9' : '#fff');
    doc.fontSize(9).fillColor('#222');
    doc.text(String(idx + 1),          cols2[0]+4, y+7, { width: 26 });
    doc.text(item.sku || '-',          cols2[1]+4, y+7, { width: cols2[2]-cols2[1]-8 });
    doc.text(item.product_name,        cols2[2]+4, y+7, { width: cols2[3]-cols2[2]-8 });
    doc.text(item.location || '-',     cols2[3]+4, y+7, { width: cols2[4]-cols2[3]-8, align: 'center' });
    doc.text(String(item.qty),         cols2[4]+4, y+7, { width: cols2[5]-cols2[4]-8, align: 'right' });
    y += rowH;
  });

  // Total
  y += 10;
  doc.rect(50, y, 495, 30).fill('#f0f0f0');
  doc.fontSize(11).fillColor('#111').text(`Total de produtos: ${items.length}`, 60, y+9);
  doc.text(`Total de unidades: ${totalQty}`, 350, y+9, { width: 180, align: 'right' });

  // Rodapé
  doc.fontSize(9).fillColor('#aaa')
    .text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} pelo MotoGest`, 50, 790, { align: 'center', width: 495 });

  doc.end();
}));
