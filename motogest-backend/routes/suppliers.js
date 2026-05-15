const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// Criar tabela se não existir
const ensureTable = db.query(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(150) NOT NULL,
    url        TEXT,
    phone      VARCHAR(30),
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM suppliers ORDER BY name ASC');
  res.json(rows);
}));

router.post('/', authorize('admin', 'gerente'), [
  body('name').notEmpty().trim().withMessage('Nome obrigatório.'),
  body('url').optional().trim(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Dados inválidos.' });
  const { name, url, phone, notes } = req.body;
  const { rows: [s] } = await db.query(
    'INSERT INTO suppliers (name, url, phone, notes) VALUES ($1,$2,$3,$4) RETURNING *',
    [name.trim(), url || null, phone || null, notes || null]
  );
  res.status(201).json(s);
}));

router.put('/:id', authorize('admin', 'gerente'), asyncHandler(async (req, res) => {
  const { name, url, phone, notes } = req.body;
  const { rows: [s] } = await db.query(
    'UPDATE suppliers SET name=$1, url=$2, phone=$3, notes=$4 WHERE id=$5 RETURNING *',
    [name, url || null, phone || null, notes || null, req.params.id]
  );
  if (!s) return res.status(404).json({ error: 'Fornecedor não encontrado.' });
  res.json(s);
}));

router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM suppliers WHERE id=$1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Fornecedor não encontrado.' });
  res.json({ message: 'Fornecedor removido.' });
}));

module.exports = router;
