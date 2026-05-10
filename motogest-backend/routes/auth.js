const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, audit } = require('../middleware/errorHandler');

const router = express.Router();

const generateTokens = (user) => {
  const payload = { id: user.id, role: user.role };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

  return { accessToken, refreshToken };
};

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().withMessage('E-mail inválido.'),
  body('password').notEmpty().withMessage('Senha obrigatória.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });
  }

  const { email, password } = req.body;

  const { rows } = await db.query(
    'SELECT id, name, email, password, role, active FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  const user = rows[0];

  if (!user || !user.active) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    await audit(db, { action: 'login_failed', entity: 'users', details: { email }, ip: req.ip });
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const { accessToken, refreshToken } = generateTokens(user);

  await audit(db, {
    userId: user.id, action: 'login', entity: 'users',
    entityId: user.id, ip: req.ip,
  });

  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  });
}));

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken não informado.' });

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
  }

  const { rows } = await db.query(
    'SELECT id, name, email, role, active FROM users WHERE id = $1',
    [decoded.id]
  );

  if (!rows.length || !rows[0].active) {
    return res.status(401).json({ error: 'Usuário não encontrado.' });
  }

  const { accessToken, refreshToken: newRefresh } = generateTokens(rows[0]);
  res.json({ accessToken, refreshToken: newRefresh });
}));

// GET /api/auth/me
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
}));

// PUT /api/auth/change-password
router.put('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;

  const { rows } = await db.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
  const valid = await bcrypt.compare(currentPassword, rows[0].password);
  if (!valid) return res.status(401).json({ error: 'Senha atual incorreta.' });

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  const hashed = await bcrypt.hash(newPassword, rounds);
  await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user.id]);

  await audit(db, { userId: req.user.id, action: 'change_password', entity: 'users', ip: req.ip });
  res.json({ message: 'Senha alterada com sucesso.' });
}));

module.exports = router;
