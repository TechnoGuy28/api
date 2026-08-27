import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { query } from './db.js';
import logger from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import categoryRoutes from './routes/categories.js';
import publicationRoutes from './routes/publications.js';
import dashboardRoutes from './routes/dashboard.js';
import auditRoutes from './routes/audit.js';
import settingsRoutes from './routes/settings.js';
import reportRoutes from './routes/reports.js';
import { initDatabase } from './db/init.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost';

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true })); // permissao explicita para a origem do PHP
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev', { skip: () => process.env.DEBUG !== 'true' }));

// Saude da API (sem dependencia de banco)
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.get('/health/db', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable', error: err.message });
  }
});

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/categories', categoryRoutes);
app.use('/publications', publicationRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/audit', auditRoutes);
app.use('/settings', settingsRoutes);
app.use('/reports', reportRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  // Ao iniciar, cria o banco/tabelas/seed automaticamente (se ainda nao existirem).
  initDatabase().finally(() => {
    app.listen(PORT, () => {
      logger.info(`API ouvindo em porta ${PORT}`, { corsOrigin: CORS_ORIGIN });
      console.log(`API de gestao de publicacoes rodando em http://localhost:${PORT}`);
    });
  });
}

export default app;
