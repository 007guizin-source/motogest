const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// GET /api/financial — listagem com filtros
router.get('/', [
  query('start').optional().isDate(),
  query('end').optional().isDate(),
  query('type').optional().isIn(['entrada', 'saida']),
  query('category').optional().isString(),
  query('page').optional().isInt({ min: 1 }).default(1),
  query('limit').optional().isInt({ min: 1, max: 200 }).default(50),
], asyncHandler(async (req, res) => {
  const { start, end, type, category, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  const conds = [];
  const params = [];

  if (start)    { params.push(start);    conds.push(`date >= $${params.length}`); }
  if (end)      { params.push(end);      conds.push(`date <= $${params.length}`); }
  if (type)     { params.push(type);     conds.push(`type = $${params.length}`); }
  if (category) { params.push(category); conds.push(`category = $${params.length}`); }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  params.push(limit, offset);

  const { rows } = await db.query(`
    SELECT ft.*, u.name as user_name
    FROM financial_transactions ft
    LEFT JOIN users u ON u.id = ft.user_id
    ${where}
    ORDER BY ft.date DESC, ft.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  res.json(rows);
}));

// GET /api/financial/summary — totais por período
router.get('/summary', [
  query('period').optional().isIn(['day', 'week', 'month', 'year']).default('month'),
], asyncHandler(async (req, res) => {
  const { period = 'month' } = req.query;

  const intervals = {
    day:   "DATE_TRUNC('day',   NOW())",
    week:  "DATE_TRUNC('week',  NOW())",
    month: "DATE_TRUNC('month', NOW())",
    year:  "DATE_TRUNC('year',  NOW())",
  };

  const trunc = intervals[period];

  const { rows: [summary] } = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'entrada' THEN value END), 0) as total_in,
      COALESCE(SUM(CASE WHEN type = 'saida'   THEN value END), 0) as total_out,
      COALESCE(SUM(CASE WHEN type = 'entrada' THEN value ELSE -value END), 0) as balance,
      COUNT(*) as transaction_count
    FROM financial_transactions
    WHERE date >= ${trunc}
  `);

  // Breakdown por categoria
  const { rows: byCategory } = await db.query(`
    SELECT category, type,
      SUM(value) as total,
      COUNT(*)   as count
    FROM financial_transactions
    WHERE date >= ${trunc}
    GROUP BY category, type
    ORDER BY total DESC
  `);

  res.json({ summary, byCategory });
}));

// GET /api/financial/cashflow — fluxo de caixa diário para gráfico
router.get('/cashflow', [
  query('days').optional().isInt({ min: 7, max: 365 }).default(30),
], asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;

  const { rows } = await db.query(`
    SELECT
      d::date as date,
      COALESCE(SUM(CASE WHEN ft.type = 'entrada' THEN ft.value END), 0) as income,
      COALESCE(SUM(CASE WHEN ft.type = 'saida'   THEN ft.value END), 0) as expense,
      COALESCE(SUM(CASE WHEN ft.type = 'entrada' THEN ft.value ELSE -ft.value END), 0) as balance
    FROM generate_series(
      CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day',
      CURRENT_DATE,
      '1 day'
    ) AS d
    LEFT JOIN financial_transactions ft ON ft.date = d::date
    GROUP BY d
    ORDER BY d ASC
  `, [days]);

  res.json(rows);
}));

// POST /api/financial — lançamento manual
router.post('/', [
  body('type').isIn(['entrada', 'saida']).withMessage('Tipo inválido.'),
  body('description').notEmpty().trim().withMessage('Descrição obrigatória.'),
  body('value').isFloat({ min: 0.01 }).withMessage('Valor inválido.'),
  body('category').notEmpty().withMessage('Categoria obrigatória.'),
  body('date').optional().isDate(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });

  const { type, description, value, category, date } = req.body;

  const { rows: [tx] } = await db.query(`
    INSERT INTO financial_transactions (type, description, value, category, user_id, date)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [type, description, value, category, req.user.id, date || new Date()]);

  res.status(201).json(tx);
}));

// DELETE /api/financial/:id — somente admin pode apagar lançamentos
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM financial_transactions WHERE id = $1 RETURNING id', [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Lançamento não encontrado.' });
  res.json({ message: 'Lançamento removido.' });
}));

module.exports = router;
