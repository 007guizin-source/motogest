const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, audit } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// ─── GET /api/products ─────────────────────────────────────────
// Listagem com busca, filtros e paginação
router.get('/', [
  query('search').optional().isString().trim(),
  query('category').optional().isInt(),
  query('lowStock').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }).default(1),
  query('limit').optional().isInt({ min: 1, max: 100 }).default(50),
], asyncHandler(async (req, res) => {
  const { search, category, lowStock, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  const conditions = ['p.active = true'];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode = $${params.length})`);
  }
  if (category) {
    params.push(category);
    conditions.push(`p.category_id = $${params.length}`);
  }
  if (lowStock === 'true') {
    conditions.push('p.stock <= p.stock_min');
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  params.push(limit, offset);
  const limitPlaceholder = params.length - 1;
  const offsetPlaceholder = params.length;

  const sql = `
    SELECT
      p.id, p.sku, p.barcode, p.name, p.brand, p.model,
      p.price_buy, p.price_sell, p.stock, p.stock_min, p.location,
      p.photo_url, p.created_at,
      c.id as category_id, c.name as category_name,
      ROUND(((p.price_sell - p.price_buy) / NULLIF(p.price_buy,0)) * 100, 1) as margin_pct
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ${where}
    ORDER BY p.name ASC
    LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}
  `;

  const countSql = `SELECT COUNT(*) FROM products p ${where}`;
  const countParams = params.slice(0, -2);

  const [{ rows }, { rows: countRows }] = await Promise.all([
    db.query(sql, params),
    db.query(countSql, countParams),
  ]);

  res.json({
    data: rows,
    pagination: {
      total: parseInt(countRows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countRows[0].count / limit),
    },
  });
}));

// ─── GET /api/products/categories ──────────────────────────────
router.get('/categories', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM categories ORDER BY name');
  res.json(rows);
}));

// ─── GET /api/products/low-stock ───────────────────────────────
router.get('/low-stock', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.active = true AND p.stock <= p.stock_min
    ORDER BY p.stock ASC
  `);
  res.json(rows);
}));

// ─── GET /api/products/:id ─────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = $1 AND p.active = true
  `, [req.params.id]);

  if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado.' });
  res.json(rows[0]);
}));

// ─── POST /api/products ────────────────────────────────────────
router.post('/', authorize('admin', 'gerente'), [
  body('name').notEmpty().trim().withMessage('Nome é obrigatório.'),
  body('sku').notEmpty().trim().withMessage('SKU é obrigatório.'),
  body('price_sell').isFloat({ min: 0 }).withMessage('Preço de venda inválido.'),
  body('price_buy').optional().isFloat({ min: 0 }),
  body('stock').optional().isInt({ min: 0 }),
  body('stock_min').optional().isInt({ min: 0 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });
  }

  const {
    name, sku, barcode, category_id, brand, model,
    price_buy = 0, price_sell, stock = 0, stock_min = 5, location, photo_url,
  } = req.body;

  const { rows } = await db.query(`
    INSERT INTO products
      (name, sku, barcode, category_id, brand, model, price_buy, price_sell, stock, stock_min, location, photo_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *
  `, [name, sku.toUpperCase(), barcode || null, category_id || null, brand, model,
      price_buy, price_sell, stock, stock_min, location, photo_url]);

  // Registrar entrada inicial de estoque
  if (stock > 0) {
    await db.query(
      `INSERT INTO stock_movements (product_id, user_id, type, qty, reason)
       VALUES ($1, $2, 'entrada', $3, 'Cadastro inicial')`,
      [rows[0].id, req.user.id, stock]
    );
  }

  await audit(db, {
    userId: req.user.id, action: 'create_product', entity: 'products',
    entityId: rows[0].id, details: { name, sku }, ip: req.ip,
  });

  res.status(201).json(rows[0]);
}));

// ─── PUT /api/products/:id ─────────────────────────────────────
router.put('/:id', authorize('admin', 'gerente'), asyncHandler(async (req, res) => {
  const { rows: existing } = await db.query(
    'SELECT * FROM products WHERE id = $1 AND active = true', [req.params.id]
  );
  if (!existing.length) return res.status(404).json({ error: 'Produto não encontrado.' });

  const prev = existing[0];
  const {
    name = prev.name, sku = prev.sku, barcode = prev.barcode,
    category_id = prev.category_id, brand = prev.brand, model = prev.model,
    price_buy = prev.price_buy, price_sell = prev.price_sell,
    stock_min = prev.stock_min, location = prev.location, photo_url = prev.photo_url,
  } = req.body;

  const { rows } = await db.query(`
    UPDATE products SET
      name=$1, sku=$2, barcode=$3, category_id=$4, brand=$5, model=$6,
      price_buy=$7, price_sell=$8, stock_min=$9, location=$10, photo_url=$11
    WHERE id=$12 RETURNING *
  `, [name, sku.toUpperCase(), barcode, category_id, brand, model,
      price_buy, price_sell, stock_min, location, photo_url, req.params.id]);

  await audit(db, {
    userId: req.user.id, action: 'update_product', entity: 'products',
    entityId: req.params.id, ip: req.ip,
  });

  res.json(rows[0]);
}));

// ─── PUT /api/products/:id/stock ───────────────────────────────
// Ajuste manual de estoque (inventário, devolução, etc.)
router.put('/:id/stock', authorize('admin', 'gerente'), [
  body('qty').isInt().withMessage('Quantidade inválida.'),
  body('reason').notEmpty().withMessage('Motivo obrigatório.'),
  body('type').isIn(['entrada', 'saida', 'ajuste', 'devolucao']),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });

  const { qty, reason, type } = req.body;

  const delta = type === 'saida' ? -Math.abs(qty) : Math.abs(qty);

  const { rows } = await db.query(
    'UPDATE products SET stock = stock + $1 WHERE id = $2 RETURNING stock',
    [delta, req.params.id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado.' });

  await db.query(
    `INSERT INTO stock_movements (product_id, user_id, type, qty, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.params.id, req.user.id, type, Math.abs(qty), reason]
  );

  res.json({ stock: rows[0].stock });
}));

// ─── DELETE /api/products/:id ──────────────────────────────────
// Soft delete
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'UPDATE products SET active = false WHERE id = $1 RETURNING id', [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado.' });

  await audit(db, {
    userId: req.user.id, action: 'delete_product', entity: 'products',
    entityId: req.params.id, ip: req.ip,
  });

  res.json({ message: 'Produto removido.' });
}));

module.exports = router;
