import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { writeAudit } from '../utils/audit.js';
import { getClientMeta, parseSince } from '../utils/request.js';
import { normalizeName, toDigits, isValidPhone } from '../utils/validators.js';
import logger from '../utils/logger.js';

const MIN_PASSWORD = 6;
const VALID_ROLES = ['leitor', 'master', 'total'];
const ADMIN_ROLES = ['master', 'total'];

/** Nome da conta total (unicamente Tulio), comparacao sem acento/maiusculas. */
function isTulioName(name) {
  const n = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return n === 'tulio';
}

function validatePassword(pw) {
  if (!pw || typeof pw !== 'string' || pw.length < MIN_PASSWORD) {
    return 'A senha deve ter ao menos 6 caracteres.';
  }
  return null;
}

export const listUsers = asyncHandler(async (req, res) => {
  const since = parseSince(req);
  const base = since
    ? `SELECT id, name, phone, role, active, created_at, updated_at FROM users WHERE updated_at > $1 ORDER BY updated_at DESC`
    : `SELECT id, name, phone, role, active, created_at, updated_at FROM users ORDER BY updated_at DESC`;
  const { rows } = await query(base, since ? [since] : []);
  res.json({ users: rows.map((u) => ({ ...u, phone_digits: toDigits(u.phone) })) });
});

export const createUser = asyncHandler(async (req, res) => {
  const name = normalizeName(req.body?.name);
  const password = req.body?.password;
  const phone = req.body?.phone ?? null;
  const role = req.body?.role;

  if (!name) return res.status(400).json({ error: 'Nome e obrigatorio.' });
  if (role === undefined || !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Informe o papel do usuário (leitor, master ou total).' });
  }
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (phone !== null && phone !== '' && !isValidPhone(phone)) {
    return res.status(400).json({ error: 'Telefone invalido.' });
  }

  // Autorizacao de papel na criacao.
  if (isTulioName(name) && req.user.role !== 'total') {
    return res.status(403).json({ error: 'A conta Tulio (total) só pode ser criada pelo usuário total.' });
  }
  if (role === 'total') {
    if (req.user.role !== 'total') {
      return res.status(403).json({ error: 'Apenas o usuário total pode conceder o papel total.' });
    }
    if (!isTulioName(name)) {
      return res.status(403).json({ error: 'O papel total é exclusivo do usuário Tulio.' });
    }
  } else if (req.user.role !== 'total' && !ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Você não tem permissão para criar usuários.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, password_hash, phone, role, active)
     VALUES ($1, $2, $3, $4, TRUE) RETURNING id, name, phone, role, active, created_at`,
    [name, hash, phone ? toDigits(phone) : null, role],
  );
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'create_user', entityType: 'user', entityId: rows[0].id,
    newValues: { name: rows[0].name, role: rows[0].role }, ip, userAgent,
  });
  res.status(201).json({ user: rows[0] });
});

export const updateUser = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (!existing[0]) return res.status(404).json({ error: 'Usuario nao encontrado.' });

  // A conta Tulio (unica total) so pode ser alterada por outro total.
  if (isTulioName(existing[0].name) && req.user.role !== 'total') {
    return res.status(403).json({ error: 'A conta Tulio (total) só pode ser alterada pelo usuário total.' });
  }

  const fields = [];
  const params = [];
  let i = 1;
  const oldValues = {};

  if (req.body?.name !== undefined) {
    const name = normalizeName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Nome invalido.' });
    fields.push(`name = $${i++}`); params.push(name);
    oldValues.name = existing[0].name;
  }
  if (req.body?.password !== undefined) {
    // Trocar a senha de OUTRO usuario exige papel total.
    if (id !== req.user.id && req.user.role !== 'total') {
      return res.status(403).json({ error: 'Apenas o usuário total pode alterar a senha de outros usuários.' });
    }
    const pwErr = validatePassword(req.body.password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    fields.push(`password_hash = $${i++}`); params.push(bcrypt.hashSync(req.body.password, 10));
    oldValues.password = '[changed]';
  }
  if (req.body?.phone !== undefined) {
    if (req.body.phone !== '' && !isValidPhone(req.body.phone)) {
      return res.status(400).json({ error: 'Telefone invalido.' });
    }
    fields.push(`phone = $${i++}`); params.push(req.body.phone ? toDigits(req.body.phone) : null);
    oldValues.phone = existing[0].phone;
  }
  if (req.body?.active !== undefined) {
    fields.push(`active = $${i++}`); params.push(Boolean(req.body.active));
    oldValues.active = existing[0].active;
  }
  if (req.body?.role !== undefined) {
    // Atribuir/alterar papel exige papel total (e 'total' e exclusivo do Tulio).
    if (req.user.role !== 'total') {
      return res.status(403).json({ error: 'Apenas o usuário total pode alterar o papel de um usuário.' });
    }
    if (!VALID_ROLES.includes(req.body.role)) {
      return res.status(400).json({ error: 'Papel invalido.' });
    }
    if (req.body.role === 'total' && !isTulioName(existing[0].name)) {
      return res.status(403).json({ error: 'O papel total é exclusivo do usuário Tulio.' });
    }
    fields.push(`role = $${i++}`); params.push(req.body.role);
    oldValues.role = existing[0].role;
  }
  if (fields.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' });

  fields.push(`updated_at = NOW()`);
  params.push(id);
  const { rows } = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name, phone, role, active`,
    params,
  );
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'update_user', entityType: 'user', entityId: id,
    oldValues, newValues: req.body, ip, userAgent,
  });
  res.json({ user: rows[0] });
});

export const updatePhone = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  // Telefone proprio e liberado a todos; o de terceiros exige master/total.
  if (id !== req.user.id && !ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Você não tem permissão para alterar o telefone de outros usuários.' });
  }
  const phone = req.body?.phone;
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Telefone invalido.' });
  }
  const { rows: existing } = await query('SELECT phone, name FROM users WHERE id = $1', [id]);
  if (!existing[0]) return res.status(404).json({ error: 'Usuario nao encontrado.' });
  if (isTulioName(existing[0].name) && req.user.role !== 'total') {
    return res.status(403).json({ error: 'A conta Tulio (total) só pode ser alterada pelo usuário total.' });
  }
  const { rows } = await query(
    'UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2 RETURNING id, phone',
    [toDigits(phone), id],
  );
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'update_user_phone', entityType: 'user', entityId: id,
    oldValues: { phone: existing[0].phone }, newValues: { phone: toDigits(phone) }, ip, userAgent,
  });
  res.json({ user: rows[0] });
});

export default { listUsers, createUser, updateUser, updatePhone };