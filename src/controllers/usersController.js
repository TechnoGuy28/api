import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { writeAudit } from '../utils/audit.js';
import { getClientMeta } from '../utils/request.js';
import { normalizeName, toDigits, isValidPhone } from '../utils/validators.js';
import logger from '../utils/logger.js';

const MIN_PASSWORD = 6;

function validatePassword(pw) {
  if (!pw || typeof pw !== 'string' || pw.length < MIN_PASSWORD) {
    return 'A senha deve ter ao menos 6 caracteres.';
  }
  return null;
}

export const listUsers = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, phone, active, created_at, updated_at
     FROM users ORDER BY name`,
  );
  res.json({ users: rows.map((u) => ({ ...u, phone_digits: toDigits(u.phone) })) });
});

export const createUser = asyncHandler(async (req, res) => {
  const name = normalizeName(req.body?.name);
  const password = req.body?.password;
  const phone = req.body?.phone ?? null;

  if (!name) return res.status(400).json({ error: 'Nome e obrigatorio.' });
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (phone !== null && phone !== '' && !isValidPhone(phone)) {
    return res.status(400).json({ error: 'Telefone invalido.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, password_hash, phone, active)
     VALUES ($1, $2, $3, TRUE) RETURNING id, name, phone, active, created_at`,
    [name, hash, phone ? toDigits(phone) : null],
  );
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'create_user', entityType: 'user', entityId: rows[0].id,
    newValues: { name: rows[0].name }, ip, userAgent,
  });
  res.status(201).json({ user: rows[0] });
});

export const updateUser = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (!existing[0]) return res.status(404).json({ error: 'Usuario nao encontrado.' });

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
  if (fields.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' });

  fields.push(`updated_at = NOW()`);
  params.push(id);
  const { rows } = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name, phone, active`,
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
  const phone = req.body?.phone;
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Telefone invalido.' });
  }
  const { rows: existing } = await query('SELECT phone FROM users WHERE id = $1', [id]);
  if (!existing[0]) return res.status(404).json({ error: 'Usuario nao encontrado.' });
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
