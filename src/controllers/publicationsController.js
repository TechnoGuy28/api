import { query, withTransaction } from '../db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { writeAudit } from '../utils/audit.js';
import { getClientMeta, parseSince } from '../utils/request.js';
import { normalizeName, normalizeCode, isValidStatus, validateMovement } from '../utils/validators.js';
import logger from '../utils/logger.js';

function buildListQuery(filters) {
  const where = [];
  const params = [];
  let i = 1;

  const since = parseSince({ query: filters });
  if (since) {
    // Sync incremental: traz apenas o que foi criado/alterado OU excluido (soft delete) desde o cursor.
    where.push(`(p.updated_at > $${i++} OR p.deleted_at > $${i++})`);
    params.push(since, since);
  } else {
    where.push('p.deleted_at IS NULL');
  }

  if (filters.name) { where.push(`p.name ILIKE $${i++}`); params.push(`%${filters.name}%`); }
  if (filters.code) { where.push(`p.code ILIKE $${i++}`); params.push(`%${filters.code}%`); }
  if (filters.category_id) { where.push(`p.category_id = $${i++}`); params.push(Number(filters.category_id)); }
  if (filters.status) { where.push(`p.status = $${i++}`); params.push(filters.status); }
  if (filters.min_qty !== undefined && filters.min_qty !== '') { where.push(`p.quantity >= $${i++}`); params.push(Number(filters.min_qty)); }
  if (filters.max_qty !== undefined && filters.max_qty !== '') { where.push(`p.quantity <= $${i++}`); params.push(Number(filters.max_qty)); }

  const sortMap = {
    quantity_asc: 'p.quantity ASC',
    quantity_desc: 'p.quantity DESC',
    name: 'p.name ASC',
    code: 'p.code ASC',
    recent: 'p.updated_at DESC',
  };
  const orderBy = sortMap[filters.sort] || 'p.updated_at DESC';

  const sql = `
    SELECT p.id, p.name, p.code, p.category_id, c.name AS category_name,
           p.image_path, p.status, p.quantity, p.created_at, p.updated_at,
           COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm
             WHERE sm.publication_id = p.id AND sm.type = 'in'
             AND sm.created_at >= date_trunc('month', now())), 0) AS qty_added_month,
           COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm
             WHERE sm.publication_id = p.id AND sm.type = 'out'
             AND sm.created_at >= date_trunc('month', now())), 0) AS qty_removed_month,
           (SELECT MAX(sm.created_at) FROM stock_movements sm WHERE sm.publication_id = p.id) AS last_movement_at,
           (SELECT u.name FROM stock_movements sm JOIN users u ON u.id = sm.user_id
             WHERE sm.publication_id = p.id ORDER BY sm.created_at DESC LIMIT 1) AS last_updated_by
    FROM publications p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
  `;
  return { sql, params };
}

export const listPublications = asyncHandler(async (req, res) => {
  const f = req.query;
  const { sql, params } = buildListQuery(f);
  const { rows } = await query(sql, params);
  res.json({ publications: rows, count: rows.length });
});

export const getPublication = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query(
    `SELECT p.*, c.name AS category_name FROM publications p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Publicacao nao encontrada.' });
  res.json({ publication: rows[0] });
});

export const createPublication = asyncHandler(async (req, res) => {
  const name = normalizeName(req.body?.name);
  const code = normalizeCode(req.body?.code);
  const categoryId = req.body?.category_id ? Number(req.body.category_id) : null;
  const status = req.body?.status || 'active';
  const imagePath = req.body?.image_path || null;
  const initialQty = Number(req.body?.initial_quantity) || 0;

  if (!name) return res.status(400).json({ error: 'Nome e obrigatorio.' });
  if (!code) return res.status(400).json({ error: 'Codigo e obrigatorio (informe manualmente).' });
  if (!isValidStatus(status)) return res.status(400).json({ error: 'Status invalido.' });
  if (initialQty < 0) return res.status(400).json({ error: 'Quantidade inicial invalida.' });

  const result = await withTransaction(async (client) => {
    const { rows: ins } = await client.query(
      `INSERT INTO publications (name, code, category_id, image_path, status, quantity, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, code, categoryId, imagePath, status, initialQty, req.user.id, req.user.id],
    );
    const pub = ins[0];
    if (initialQty > 0) {
      await client.query(
        `INSERT INTO stock_movements
          (publication_id, user_id, type, quantity, previous_quantity, resulting_quantity, note, created_at)
         VALUES ($1, $2, 'in', $3, 0, $4, 'Estoque inicial', NOW())`,
        [pub.id, req.user.id, initialQty, initialQty],
      );
    }
    return pub;
  });

  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'create_publication', entityType: 'publication', entityId: result.id,
    newValues: { name, code, status, initialQty }, ip, userAgent,
  });
  res.status(201).json({ publication: result });
});

export const updatePublication = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await query('SELECT * FROM publications WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing[0]) return res.status(404).json({ error: 'Publicacao nao encontrada.' });

  const fields = [];
  const params = [];
  let i = 1;
  const oldValues = {};
  if (req.body?.name !== undefined) { fields.push(`name = $${i++}`); params.push(normalizeName(req.body.name)); oldValues.name = existing[0].name; }
  if (req.body?.code !== undefined) { fields.push(`code = $${i++}`); params.push(normalizeCode(req.body.code)); oldValues.code = existing[0].code; }
  if (req.body?.category_id !== undefined) { fields.push(`category_id = $${i++}`); params.push(req.body.category_id ? Number(req.body.category_id) : null); oldValues.category_id = existing[0].category_id; }
  if (req.body?.image_path !== undefined) { fields.push(`image_path = $${i++}`); params.push(req.body.image_path || null); oldValues.image_path = existing[0].image_path; }
  if (req.body?.status !== undefined) {
    if (!isValidStatus(req.body.status)) return res.status(400).json({ error: 'Status invalido.' });
    fields.push(`status = $${i++}`); params.push(req.body.status); oldValues.status = existing[0].status;
  }
  if (fields.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' });
  fields.push(`updated_at = NOW()`); fields.push(`updated_by = $${i++}`); params.push(req.user.id);
  params.push(id);
  const { rows } = await query(`UPDATE publications SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, params);
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'update_publication', entityType: 'publication', entityId: id,
    oldValues, newValues: req.body, ip, userAgent,
  });
  res.json({ publication: rows[0] });
});

export const deactivatePublication = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await query('SELECT * FROM publications WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing[0]) return res.status(404).json({ error: 'Publicacao nao encontrada.' });
  const { rows } = await query(
    `UPDATE publications SET status = 'inactive', deleted_at = NOW(), updated_at = NOW(), updated_by = $2
     WHERE id = $1 RETURNING *`,
    [id, req.user.id],
  );
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'deactivate_publication', entityType: 'publication', entityId: id,
    oldValues: { status: existing[0].status }, newValues: { status: 'inactive' }, ip, userAgent,
  });
  res.json({ publication: rows[0] });
});

// Totais de movimentacao por publicacao desde um cursor (?since=).
// Usado pelos relatorios para calcular entradas/saidas de um periodo de fechamento.
export const stockSummary = asyncHandler(async (req, res) => {
  const since = parseSince(req);
  const params = since ? [since] : [];
  const where = since ? `WHERE sm.created_at > $1` : '';
  const { rows } = await query(
    `SELECT sm.publication_id AS publication_id,
            SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE 0 END) AS entries,
            SUM(CASE WHEN sm.type = 'out' THEN sm.quantity ELSE 0 END) AS exits,
            SUM(CASE WHEN sm.type = 'adjust' THEN sm.quantity ELSE 0 END) AS adjustments
     FROM stock_movements sm
     ${where}
     GROUP BY sm.publication_id`,
    params,
  );
  const summary = {};
  for (const r of rows) {
    summary[String(r.publication_id)] = {
      entries: Number(r.entries) || 0,
      exits: Number(r.exits) || 0,
      adjustments: Number(r.adjustments) || 0,
    };
  }
  res.json({ summary });
});

export default { listPublications, getPublication, createPublication, updatePublication, deactivatePublication, stockSummary };
