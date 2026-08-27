import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { writeAudit } from '../utils/audit.js';
import { getClientMeta } from '../utils/request.js';
import logger from '../utils/logger.js';

export const login = asyncHandler(async (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) {
    return res.status(400).json({ error: 'Informe usuario e senha.' });
  }
  const { rows } = await query(
    'SELECT id, name, password_hash, active FROM users WHERE LOWER(name) = LOWER($1)',
    [name],
  );
  const user = rows[0];
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    logger.warn('Login falhou', { name });
    return res.status(401).json({ error: 'Usuario ou senha invalidos.' });
  }
  const token = signToken({ sub: user.id, name: user.name });
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({ userId: user.id, action: 'login', entityType: 'user', entityId: user.id, ip, userAgent });
  res.json({ token, user: { id: user.id, name: user.name, phone: null } });
});

export const me = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, phone, active FROM users WHERE id = $1',
    [req.user.id],
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'Usuario nao encontrado.' });
  res.json({ user });
});

export const logout = asyncHandler(async (req, res) => {
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({ userId: req.user.id, action: 'logout', entityType: 'user', entityId: req.user.id, ip, userAgent });
  res.json({ ok: true });
});

export default { login, me, logout };
