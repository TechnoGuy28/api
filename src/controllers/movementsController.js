import { query, withTransaction } from '../db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { writeAudit } from '../utils/audit.js';
import { getClientMeta, parseSince } from '../utils/request.js';
import { validateMovement } from '../utils/validators.js';

export const listMovements = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;
  const typeFilter = req.query.type ? 'AND type = $2' : '';
  const params = [id];
  if (req.query.type) params.push(req.query.type);

  const since = parseSince(req);
  let sinceFilter = '';
  if (since) { sinceFilter = `AND sm.created_at > $${params.length + 1}`; params.push(since); }

  const { rows } = await query(
    `SELECT sm.*, u.name AS user_name FROM stock_movements sm
     LEFT JOIN users u ON u.id = sm.user_id
     WHERE sm.publication_id = $1 ${typeFilter} ${sinceFilter}
     ORDER BY sm.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  const countRes = await query(
    `SELECT COUNT(*) AS total FROM stock_movements WHERE publication_id = $1 ${typeFilter}`,
    params,
  );
  res.json({ movements: rows, total: Number(countRes.rows[0].total), page, limit });
});

export const createMovement = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const type = req.body?.type;
  const quantity = req.body?.quantity;
  const note = req.body?.note ?? null;

  const { rows: pub } = await query(
    'SELECT id, name, code, quantity FROM publications WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!pub[0]) return res.status(404).json({ error: 'Publicacao nao encontrada.' });

  const validation = validateMovement({ type, previousQuantity: pub[0].quantity, quantity });
  if (!validation.ok) return res.status(400).json({ error: validation.error });

  const result = await withTransaction(async (client) => {
    const { rows: mv } = await client.query(
      `INSERT INTO stock_movements
        (publication_id, user_id, type, quantity, previous_quantity, resulting_quantity, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
      [id, req.user.id, type, validation.value, pub[0].quantity, validation.resulting, note],
    );
    await client.query(
      'UPDATE publications SET quantity = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3',
      [validation.resulting, req.user.id, id],
    );
    return mv[0];
  });

  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: type === 'in' ? 'stock_in' : type === 'out' ? 'stock_out' : 'stock_adjust',
    entityType: 'publication', entityId: id,
    newValues: { type, quantity: validation.value, resulting: validation.resulting }, ip, userAgent,
  });
  res.status(201).json({ movement: result, current_quantity: validation.resulting });
});

export const monthlyHistory = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query(
    `SELECT to_char(created_at, 'YYYY-MM') AS month,
            SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END) AS entries,
            SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END) AS exits,
            SUM(CASE WHEN type = 'adjust' THEN quantity ELSE 0 END) AS adjustments,
            COUNT(*) AS movements_count
     FROM stock_movements
     WHERE publication_id = $1
     GROUP BY month ORDER BY month`,
    [id],
  );
  res.json({ monthly: rows });
});

export default { listMovements, createMovement, monthlyHistory };
