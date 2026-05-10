const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, audit } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// GET /api/customers
router.get('/', [
  query('search').optional().isString().trim(),
  query('withDebt').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }).default(1),
  query('limit').optional().isInt({ min: 1, max: 100 }).default(50),
], asyncHandler(async (req, res) => {
  const { search, withDebt, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  const conds = ['active = true'];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conds.push(`(name ILIKE $${params.length} OR phone ILIKE $${params.length} OR document ILIKE $${params.length})`);
  }
  if (withDebt === 'true') conds.push('debt > 0');

  const where = 'WHERE ' + conds.join(' AND ');
  params.push(limit, offset);

  const { rows } = await db.query(`
    SELECT
      c.*,
      (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') as purchase_count,
      (SELECT COALESCE(SUM(total),0) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') as total_spent
    FROM customers c
    ${where}
    ORDER BY c.name ASC
    LIMIT $${params.length-1} OFFSET $${params.length}
  `, params);

  res.json(rows);
}));

// GET /api/customers/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows: [customer] } = await db.query(
    'SELECT * FROM customers WHERE id = $1 AND active = true', [req.params.id]
  );
  if (!customer) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const [{ rows: purchases }, { rows: debts }] = await Promise.all([
    db.query(`
      SELECT s.id, s.number, s.total, s.payment_method, s.created_at
      FROM sales s
      WHERE s.customer_id = $1 AND s.status = 'completed'
      ORDER BY s.created_at DESC LIMIT 20
    `, [req.params.id]),
    db.query(`
      SELECT * FROM debt_records
      WHERE customer_id = $1
      ORDER BY created_at DESC LIMIT 30
    `, [req.params.id]),
  ]);

  res.json({ customer, purchases, debts });
}));

// POST /api/customers
router.post('/', [
  body('name').notEmpty().trim().withMessage('Nome obrigatório.'),
  body('phone').optional().trim(),
  body('document').optional().trim(),
  body('credit_limit').optional().isFloat({ min: 0 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });

  const { name, document, phone, email, address, city, state, credit_limit = 0, notes } = req.body;

  const { rows: [customer] } = await db.query(`
    INSERT INTO customers (name, document, phone, email, address, city, state, credit_limit, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
  `, [name, document, phone, email, address, city, state, credit_limit, notes]);

  await audit(db, { userId: req.user.id, action: 'create_customer', entity: 'customers', entityId: customer.id, ip: req.ip });
  res.status(201).json(customer);
}));

// PUT /api/customers/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { rows: [prev] } = await db.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!prev) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const { name=prev.name, document=prev.document, phone=prev.phone, email=prev.email,
          address=prev.address, city=prev.city, state=prev.state,
          credit_limit=prev.credit_limit, notes=prev.notes } = req.body;

  const { rows: [customer] } = await db.query(`
    UPDATE customers SET name=$1, document=$2, phone=$3, email=$4, address=$5,
      city=$6, state=$7, credit_limit=$8, notes=$9
    WHERE id=$10 RETURNING *
  `, [name, document, phone, email, address, city, state, credit_limit, notes, req.params.id]);

  res.json(customer);
}));

// POST /api/customers/:id/debt — registrar débito manual ou pagamento
router.post('/:id/debt', [
  body('type').isIn(['debito', 'pagamento']),
  body('value').isFloat({ min: 0.01 }),
  body('description').optional().trim(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });

  const { type, value, description } = req.body;

  await db.withTransaction(async (client) => {
    const delta = type === 'debito' ? value : -value;
    const { rows: [c] } = await client.query(
      'UPDATE customers SET debt = GREATEST(0, debt + $1) WHERE id = $2 RETURNING debt',
      [delta, req.params.id]
    );
    if (!c) throw Object.assign(new Error('Cliente não encontrado.'), { status: 404 });

    await client.query(`
      INSERT INTO debt_records (customer_id, type, value, description, user_id)
      VALUES ($1,$2,$3,$4,$5)
    `, [req.params.id, type, value, description || null, req.user.id]);

    if (type === 'pagamento') {
      await client.query(`
        INSERT INTO financial_transactions (type, description, value, category, user_id)
        VALUES ('entrada', $1, $2, 'Recebimentos', $3)
      `, [`Pagamento fiado - ${description || ''}`, value, req.user.id]);
    }

    return c;
  });

  const { rows: [updated] } = await db.query('SELECT debt FROM customers WHERE id = $1', [req.params.id]);
  res.json({ debt: updated.debt, message: type === 'pagamento' ? 'Pagamento registrado.' : 'Débito adicionado.' });
}));

// DELETE /api/customers/:id — soft delete
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const { rows: [c] } = await db.query(
    'SELECT debt FROM customers WHERE id = $1', [req.params.id]
  );
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (c.debt > 0) return res.status(409).json({ error: 'Cliente possui débito pendente. Quite antes de remover.' });

  await db.query('UPDATE customers SET active = false WHERE id = $1', [req.params.id]);
  res.json({ message: 'Cliente removido.' });
}));

module.exports = router;
