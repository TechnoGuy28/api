import { query } from '../db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { parseSince } from '../utils/request.js';

export const listLogs = asyncHandler(async (req, res) => {
  const { date_from, date_to, user_id, action, entity_type } = req.query;
  const where = [];
  const params = [];
  let i = 1;

  const since = parseSince(req);
  if (since) { where.push(`a.created_at > $${i++}`); params.push(since); }
  if (date_from) { where.push(`a.created_at >= $${i++}`); params.push(date_from); }
  if (date_to) { where.push(`a.created_at <= $${i++}`); params.push(date_to); }
  if (user_id) { where.push(`a.user_id = $${i++}`); params.push(Number(user_id)); }
  if (action) { where.push(`a.action = $${i++}`); params.push(action); }
  if (entity_type) { where.push(`a.entity_type = $${i++}`); params.push(entity_type); }

  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT a.*, u.name AS user_name FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereSql}
     ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  const countRes = await query(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`, params);
  res.json({ logs: rows, total: Number(countRes.rows[0].total), page, limit });
});

export default { listLogs };
