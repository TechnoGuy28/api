import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
  max: 10,
});

pool.on('error', (err) => {
  // Erros inesperados no pool nao devem derrubar o processo.
  console.error('[DB POOL ERROR]', err.message);
});

export async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (process.env.DEBUG === 'true') {
      console.log(`[DB] ${text} (${Date.now() - start}ms)`);
    }
    return res;
  } catch (err) {
    console.error('[DB QUERY ERROR]', err.message, '\nSQL:', text);
    throw err;
  }
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
