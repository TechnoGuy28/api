import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../../logs');

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function ts() {
  return new Date().toISOString();
}

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = { ...obj };
  for (const k of ['password', 'password_hash', 'senha', 'token', 'authorization']) {
    if (k in clone) clone[k] = '[REDACTED]';
  }
  return clone;
}

/**
 * Registra uma mensagem de log em arquivo e no console.
 * Nunca recebe senhas ou dados sensiveis como argumento.
 */
export function log(level, message, meta = {}) {
  ensureDir();
  const line = `${ts()} [${level.toUpperCase()}] ${message} ${
    Object.keys(meta).length ? JSON.stringify(redact(meta)) : ''
  }\n`;
  const file = path.join(LOG_DIR, `app-${new Date().toISOString().slice(0, 10)}.log`);
  try {
    fs.appendFileSync(file, line);
  } catch (e) {
    console.error('Falha ao escrever log:', e.message);
  }
  if (process.env.DEBUG === 'true' || level === 'error') {
    console.log(line.trim());
  }
}

export const logger = {
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta),
};

export default logger;
