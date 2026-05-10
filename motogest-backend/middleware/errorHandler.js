/**
 * Wrapper para rotas async — captura erros e passa ao errorHandler.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Middleware global de tratamento de erros.
 * Deve ser o ÚLTIMO middleware registrado no Express.
 */
const errorHandler = (err, req, res, next) => {
  // Log detalhado em desenvolvimento
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${req.method} ${req.path}`, err);
  }

  // Erros de validação do express-validator
  if (err.type === 'validation') {
    return res.status(422).json({ error: 'Dados inválidos.', details: err.errors });
  }

  // Violação de constraint única no PostgreSQL (ex: SKU duplicado)
  if (err.code === '23505') {
    const field = err.detail?.match(/Key \((.+)\)/)?.[1] || 'campo';
    return res.status(409).json({ error: `Valor duplicado: ${field} já existe.` });
  }

  // FK violation
  if (err.code === '23503') {
    return res.status(409).json({ error: 'Referência inválida. Registro relacionado não existe.' });
  }

  // JWT errors (tratados no middleware, mas por segurança)
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  // Erros genéricos
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Erro interno do servidor.';
  res.status(status).json({ error: message });
};

/**
 * 404 handler — registrar antes do errorHandler.
 */
const notFound = (req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
};

/**
 * Registra ação no audit_log.
 */
const audit = async (db, { userId, action, entity, entityId, details, ip }) => {
  try {
    await db.query(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, action, entity || null, entityId || null,
       details ? JSON.stringify(details) : null, ip || null]
    );
  } catch (_) {
    // Não interrompe a requisição por falha de auditoria
  }
};

module.exports = { asyncHandler, errorHandler, notFound, audit };
