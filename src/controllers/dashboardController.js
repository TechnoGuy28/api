import { query } from '../db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';

export const summary = asyncHandler(async (req, res) => {
  const monthStart = "date_trunc('month', now())";

  const totals = await query(`
    SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total_publications,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'active') AS total_active,
      COALESCE(SUM(quantity) FILTER (WHERE deleted_at IS NULL), 0) AS total_stock,
      COALESCE(SUM(exposure_quantity) FILTER (WHERE deleted_at IS NULL), 0) AS total_exposure
    FROM publications
  `);

  const entriesExits = await query(`
    SELECT
      COALESCE(SUM(quantity) FILTER (WHERE type = 'in' AND created_at >= ${monthStart}), 0) AS entries_month,
      COALESCE(SUM(quantity) FILTER (WHERE type = 'out' AND created_at >= ${monthStart}), 0) AS exits_month
    FROM stock_movements
  `);

  const topEntries = await query(`
    SELECT p.id, p.name, p.code, COALESCE(SUM(sm.quantity),0) AS total
    FROM stock_movements sm
    JOIN publications p ON p.id = sm.publication_id
    WHERE sm.type = 'in' AND sm.created_at >= ${monthStart}
    GROUP BY p.id, p.name, p.code
    ORDER BY total DESC LIMIT 5
  `);

  const topExits = await query(`
    SELECT p.id, p.name, p.code, COALESCE(SUM(sm.quantity),0) AS total
    FROM stock_movements sm
    JOIN publications p ON p.id = sm.publication_id
    WHERE sm.type = 'out' AND sm.created_at >= ${monthStart}
    GROUP BY p.id, p.name, p.code
    ORDER BY total DESC LIMIT 5
  `);

  const last = await query(`
    SELECT sm.id, sm.type, sm.quantity, sm.created_at, p.name AS publication_name, u.name AS user_name
    FROM stock_movements sm
    LEFT JOIN publications p ON p.id = sm.publication_id
    LEFT JOIN users u ON u.id = sm.user_id
    ORDER BY sm.created_at DESC LIMIT 10
  `);

  res.json({
    total_publications: Number(totals.rows[0].total_publications),
    total_active: Number(totals.rows[0].total_active),
    total_stock: Number(totals.rows[0].total_stock),
    total_exposure: Number(totals.rows[0].total_exposure),
    entries_month: Number(entriesExits.rows[0].entries_month),
    exits_month: Number(entriesExits.rows[0].exits_month),
    top_entries: topEntries.rows,
    top_exits: topExits.rows,
    last_movements: last.rows,
  });
});

export default { summary };
