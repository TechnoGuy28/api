import { query } from '../db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { writeAudit } from '../utils/audit.js';
import { getClientMeta, parseSince } from '../utils/request.js';
import { normalizeName } from '../utils/validators.js';

export const listCategories = asyncHandler(async (req, res) => {
  const since = parseSince(req);
  const rows = since
    ? await query(
        `SELECT c.*, (SELECT COUNT(*) FROM publications p WHERE p.category_id = c.id AND p.deleted_at IS NULL) AS publications_count
         FROM categories c WHERE c.updated_at > $1 ORDER BY c.updated_at DESC`,
        [since],
      ).then((r) => r.rows)
    : (await query(
        `SELECT c.*, (SELECT COUNT(*) FROM publications p WHERE p.category_id = c.id AND p.deleted_at IS NULL) AS publications_count
         FROM categories c ORDER BY c.updated_at DESC`,
      )).rows;
  res.json({ categories: rows });
});

export const createCategory = asyncHandler(async (req, res) => {
  const name = normalizeName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Nome da categoria e obrigatorio.' });
  const { rows } = await query(
    `INSERT INTO categories (name, active) VALUES ($1, TRUE) RETURNING *`,
    [name],
  );
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'create_category', entityType: 'category', entityId: rows[0].id,
    newValues: { name: rows[0].name }, ip, userAgent,
  });
  res.status(201).json({ category: rows[0] });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await query('SELECT * FROM categories WHERE id = $1', [id]);
  if (!existing[0]) return res.status(404).json({ error: 'Categoria nao encontrada.' });

  const fields = [];
  const params = [];
  let i = 1;
  if (req.body?.name !== undefined) {
    const name = normalizeName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Nome invalido.' });
    fields.push(`name = $${i++}`); params.push(name);
  }
  if (req.body?.active !== undefined) {
    fields.push(`active = $${i++}`); params.push(Boolean(req.body.active));
  }
  if (fields.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' });
  fields.push(`updated_at = NOW()`);
  params.push(id);
  const { rows } = await query(
    `UPDATE categories SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    params,
  );
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'update_category', entityType: 'category', entityId: id,
    newValues: req.body, ip, userAgent,
  });
  res.json({ category: rows[0] });
});

export default { listCategories, createCategory, updateCategory };
