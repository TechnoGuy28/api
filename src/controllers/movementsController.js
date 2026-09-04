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
    'SELECT id, name, code, quantity, exposure_quantity FROM publications WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!pub[0]) return res.status(404).json({ error: 'Publicacao nao encontrada.' });

  const validation = validateMovement({
    type,
    state: { stock: pub[0].quantity, exposure: pub[0].exposure_quantity },
    quantity,
  });
  if (!validation.ok) return res.status(400).json({ error: validation.error });

  const result = await withTransaction(async (client) => {
    const { rows: mv } = await client.query(
      `INSERT INTO stock_movements
        (publication_id, user_id, type, quantity,
         previous_quantity, resulting_quantity, previous_exposure, resulting_exposure, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
      [id, req.user.id, type, validation.value,
       pub[0].quantity, validation.resulting.stock, pub[0].exposure_quantity, validation.resulting.exposure, note],
    );
    await client.query(
      'UPDATE publications SET quantity = $1, exposure_quantity = $2, updated_at = NOW(), updated_by = $3 WHERE id = $4',
      [validation.resulting.stock, validation.resulting.exposure, req.user.id, id],
    );
    return mv[0];
  });

  const { ip, userAgent } = getClientMeta(req);
const actionMap = { in: 'estoque_adicionado', out: 'estoque_removido' };
   await writeAudit({
     userId: req.user.id,
     action: actionMap[type] || (type === 'to_exposure' ? 'movimento_para_exposicao' : 'movimento_para_estoque'),
     entityType: 'publication', entityId: id,
     newValues: {
       type, quantity: validation.value,
       resulting: { stock: validation.resulting.stock, exposure: validation.resulting.exposure },
     }, ip, userAgent,
   });
  res.status(201).json({
    movement: result,
    current_quantity: validation.resulting.stock,
    current_exposure: validation.resulting.exposure,
  });
});

export const monthlyHistory = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query(
    `WITH eff AS (
       SELECT sm.publication_id,
              date_trunc('month', sm.created_at) AS m,
              sm.type, sm.quantity,
              CASE WHEN sm.type = 'to_exposure' THEN sm.quantity
                   WHEN sm.type = 'out' THEN -sm.quantity
                   WHEN sm.type = 'to_stock' THEN -sm.quantity
                   ELSE 0 END AS exp_effect
       FROM stock_movements sm
       WHERE sm.publication_id = $1
     ),
     agg AS (
       SELECT publication_id, m,
              COALESCE(SUM(quantity) FILTER (WHERE type = 'in'), 0) AS entries,
              COALESCE(SUM(quantity) FILTER (WHERE type = 'out'), 0) AS exits,
              COALESCE(SUM(quantity) FILTER (WHERE type = 'to_exposure'), 0) AS to_exposure,
              COALESCE(SUM(quantity) FILTER (WHERE type = 'to_stock'), 0) AS to_stock,
              COUNT(*) AS movements_count,
              SUM(exp_effect) AS month_effect
       FROM eff
       GROUP BY publication_id, m
     ),
     cum AS (
       SELECT a.publication_id, a.m,
              COALESCE(SUM(b.month_effect), 0) AS exposure_end_month
       FROM agg a
       LEFT JOIN agg b ON b.publication_id = a.publication_id AND b.m <= a.m
       GROUP BY a.publication_id, a.m
     )
     SELECT to_char(a.m, 'YYYY-MM') AS month,
            a.entries, a.exits, a.to_exposure, a.to_stock, a.movements_count,
            c.exposure_end_month
     FROM agg a
     JOIN cum c ON c.publication_id = a.publication_id AND c.m = a.m
     ORDER BY month`,
    [id],
  );
  res.json({ monthly: rows });
});

export default { listMovements, createMovement, monthlyHistory };
