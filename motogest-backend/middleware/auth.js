const jwt = require('jsonwebtoken');
const db = require('../config/database');

/**
 * Middleware de autenticação JWT.
 * Valida o token no header Authorization: Bearer <token>
 * e injeta req.user com { id, name, email, role }.
 */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verifica se o usuário ainda existe e está ativo
    const { rows } = await db.query(
      'SELECT id, name, email, role, active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!rows.length || !rows[0].active) {
      return res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Faça login novamente.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
};

/**
 * Middleware de autorização por cargo.
 * Uso: authorize('admin', 'gerente')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({
      error: `Acesso negado. Requer perfil: ${roles.join(' ou ')}.`,
    });
  }
  next();
};

module.exports = { authenticate, authorize };
