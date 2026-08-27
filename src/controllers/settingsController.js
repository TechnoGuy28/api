import { query } from '../db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { writeAudit } from '../utils/audit.js';
import { getClientMeta } from '../utils/request.js';

function isValidClosingDay(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 28;
}

export const getSettings = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT key, value FROM settings');
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  res.json({ settings: map });
});

export const setClosingDay = asyncHandler(async (req, res) => {
  const day = req.body?.closing_day;
  if (!isValidClosingDay(day)) {
    return res.status(400).json({ error: 'Dia de fechamento deve ser um inteiro entre 1 e 28.' });
  }
  const { rows: existing } = await query("SELECT value FROM settings WHERE key = 'closing_day'");
  await query(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES ('closing_day', $1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()`,
    [String(day), req.user.id],
  );
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'update_setting', entityType: 'setting', entityId: null,
    oldValues: { closing_day: existing[0]?.value }, newValues: { closing_day: String(day) }, ip, userAgent,
  });
  res.json({ settings: { closing_day: String(day) } });
});

export default { getSettings, setClosingDay };
