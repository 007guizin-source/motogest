const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool de conexão:', err.message);
  process.exit(1);
});

/**
 * Executa uma query simples.
 * @param {string} text  - SQL
 * @param {any[]}  params - parâmetros
 */
const query = (text, params) => pool.query(text, params);

/**
 * Obtém um cliente do pool para transações manuais.
 * Uso:
 *   const client = await db.getClient();
 *   try {
 *     await client.query('BEGIN');
 *     ...
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *   } finally {
 *     client.release();
 *   }
 */
const getClient = () => pool.connect();

/**
 * Helper para transações — gerencia BEGIN/COMMIT/ROLLBACK automaticamente.
 * @param {Function} fn - função que recebe o client e retorna Promise
 */
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { query, getClient, withTransaction, pool };
