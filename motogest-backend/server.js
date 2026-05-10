require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const compression = require('compression');
const path       = require('path');

const db = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// ── Rotas ──────────────────────────────────────────────────────
const authRoutes      = require('./routes/auth');
const productRoutes   = require('./routes/products');
const salesRoutes     = require('./routes/sales');
const customerRoutes  = require('./routes/customers');
const financialRoutes = require('./routes/financial');
const reportRoutes    = require('./routes/reports');
const userRoutes      = require('./routes/users');

// ── App ────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3001;

// ── Segurança ──────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting global
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max:      parseInt(process.env.RATE_LIMIT_MAX || '200'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
}));

// Rate limit mais rígido para login
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
}));

// ── Middleware ─────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Upload de fotos (local)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Health check ───────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({
      status: 'ok',
      version: require('./package.json').version,
      env: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: 'error', message: 'Banco de dados indisponível.' });
  }
});

// ── Rotas da API ───────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/products',  productRoutes);
app.use('/api/sales',     salesRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/reports',   reportRoutes);
app.use('/api/users',     userRoutes);

// ── 404 e handler de erros ─────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Inicialização ──────────────────────────────────────────────
const start = async () => {
  try {
    await db.query('SELECT NOW()');
    console.log('✅ Banco de dados conectado.');
const bcrypt = require('bcryptjs');
bcrypt.hash('admin123', 10).then(h => {
  db.query("UPDATE users SET password=$1 WHERE email='admin@motogest.com'", [h]);
  console.log('✅ Senha admin sincronizada');
});

    app.listen(PORT, () => {
      console.log(`🚀 MotoGest API rodando na porta ${PORT}`);
      console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Health:   http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('❌ Falha ao conectar ao banco:', err.message);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} recebido. Encerrando servidor...`);
  await db.pool.end();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  console.error('UnhandledRejection:', err);
});

start();

module.exports = app; // para testes
