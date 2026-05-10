const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, audit } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate, authorize('admin'));

// GET /api/users
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT id, name, email, role, active, created_at,
      (SELECT created_at FROM audit_log al WHERE al.user_id = u.id ORDER BY created_at DESC LIMIT 1) as last_action
    FROM users u
    ORDER BY name ASC
  `);
  res.json(rows);
}));

// GET /api/users/:id/audit — histórico de ações do usuário
router.get('/:id/audit', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT action, entity, entity_id, details, ip, created_at
    FROM audit_log
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 100
  `, [req.params.id]);
  res.json(rows);
}));

// POST /api/users
router.post('/', [
  body('name').notEmpty().trim().withMessage('Nome obrigatório.'),
  body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('password').isLength({ min: 6 }).withMessage('Senha mínima: 6 caracteres.'),
  body('role').isIn(['admin', 'gerente', 'caixa']).withMessage('Cargo inválido.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });

  const { name, email, password, role } = req.body;
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  const hashed = await bcrypt.hash(password, rounds);

  const { rows: [user] } = await db.query(`
    INSERT INTO users (name, email, password, role)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, email, role, active, created_at
  `, [name, email, hashed, role]);

  await audit(db, {
    userId: req.user.id, action: 'create_user', entity: 'users',
    entityId: user.id, details: { name, email, role }, ip: req.ip,
  });

  res.status(201).json(user);
}));

// PUT /api/users/:id
router.put('/:id', [
  body('name').optional().notEmpty().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn(['admin', 'gerente', 'caixa']),
  body('active').optional().isBoolean(),
], asyncHandler(async (req, res) => {
  // Impede que o admin remova a si mesmo
  if (req.params.id === req.user.id && req.body.active === false) {
    return res.status(400).json({ error: 'Você não pode desativar sua própria conta.' });
  }

  const { rows: [prev] } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!prev) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const {
    name   = prev.name,
    email  = prev.email,
    role   = prev.role,
    active = prev.active,
  } = req.body;

  const { rows: [user] } = await db.query(`
    UPDATE users SET name=$1, email=$2, role=$3, active=$4
    WHERE id=$5
    RETURNING id, name, email, role, active, created_at
  `, [name, email, role, active, req.params.id]);

  await audit(db, {
    userId: req.user.id, action: 'update_user', entity: 'users',
    entityId: req.params.id, ip: req.ip,
  });

  res.json(user);
}));

// PUT /api/users/:id/reset-password — admin reseta senha de outro usuário
router.put('/:id/reset-password', [
  body('newPassword').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  const hashed = await bcrypt.hash(req.body.newPassword, rounds);

  const { rows } = await db.query(
    'UPDATE users SET password=$1 WHERE id=$2 RETURNING id', [hashed, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });

  await audit(db, {
    userId: req.user.id, action: 'reset_password', entity: 'users',
    entityId: req.params.id, ip: req.ip,
  });

  res.json({ message: 'Senha redefinida com sucesso.' });
}));

module.exports = router;
