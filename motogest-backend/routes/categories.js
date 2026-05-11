const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// GET /api/categories
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.active = true
    GROUP BY c.id ORDER BY c.name ASC
  `);
  res.json(rows);
}));

// POST /api/categories
router.post('/', authorize('admin', 'gerente'), [
  body('name').notEmpty().trim().withMessage('Nome obrigatório.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Nome inválido.' });

  const { name } = req.body;
  const { rows: [cat] } = await db.query(
    'INSERT INTO categories (name) VALUES ($1) RETURNING *',
    [name.trim()]
  );
  res.status(201).json(cat);
}));

// PUT /api/categories/:id
router.put('/:id', authorize('admin', 'gerente'), [
  body('name').notEmpty().trim().withMessage('Nome obrigatório.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Nome inválido.' });

  const { rows: [cat] } = await db.query(
    'UPDATE categories SET name=$1 WHERE id=$2 RETURNING *',
    [req.body.name.trim(), req.params.id]
  );
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json(cat);
}));

// DELETE /api/categories/:id
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const { rows: [count] } = await db.query(
    'SELECT COUNT(*) FROM products WHERE category_id=$1 AND active=true',
    [req.params.id]
  );
  if (parseInt(count.count) > 0) {
    return res.status(409).json({ error: `Categoria possui ${count.count} produto(s). Remova ou reclassifique antes de excluir.` });
  }
  const { rows } = await db.query('DELETE FROM categories WHERE id=$1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json({ message: 'Categoria removida.' });
}));

module.exports = router;
