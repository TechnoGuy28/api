import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { query } from '../db.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, '../../database');

/**
 * Garante que o banco de dados existe.
 * Se a conexao falhar indicando que o banco nao existe (codigo 3D000),
 * conecta ao banco de manutencao (postgres) e o cria.
 */
export async function ensureDatabase() {
  try {
    await query('SELECT 1');
    return;
  } catch (err) {
    if (err.code !== '3D000') {
      // Erro de rede, credencial etc. — nao tenta criar.
      throw err;
    }
    const dbName = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '');
    const maintUrl = new URL(process.env.DATABASE_URL);
    maintUrl.pathname = '/postgres';

    logger.warn(`Banco "${dbName}" nao existe. Tentando criar via banco de manutencao...`);
    const pool = new pg.Pool({
      connectionString: maintUrl.toString(),
      ssl: { rejectUnauthorized: false },
    });
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
      if (res.rowCount === 0) {
        await client.query(`CREATE DATABASE "${dbName}"`);
        logger.info(`Banco "${dbName}" criado com sucesso.`);
      }
    } finally {
      client.release();
      await pool.end();
    }
  }
}

/**
 * Cria as tabelas (schema.sql) e o seed inicial (seed.sql) caso nao existam.
 * E idempotente: pode rodar a cada inicializacao sem efeitos colaterais.
 */
export async function initDatabase() {
  try {
    await ensureDatabase();
    const schema = fs.readFileSync(path.join(DB_DIR, 'schema.sql'), 'utf8');
    await query(schema);
    const seed = fs.readFileSync(path.join(DB_DIR, 'seed.sql'), 'utf8');
    await query(seed);
    logger.info('Banco de dados inicializado (schema + seed).');
    return true;
  } catch (err) {
    logger.error('Falha ao inicializar o banco de dados', { error: err.message });
    return false;
  }
}

export default initDatabase;
