import { query, withTransaction } from '../db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { writeAudit } from '../utils/audit.js';
import { getClientMeta } from '../utils/request.js';
import logger from '../utils/logger.js';

// Lista relatorios mensais registrados.
export const listReports = asyncHandler(async (req, res) => {
  const since = parseSince(req);
  const where = since ? `WHERE r.generated_at > $1` : '';
  const params = since ? [since] : [];
  const { rows } = await query(
    `SELECT r.*, u.name AS generated_by_name FROM monthly_reports r
     LEFT JOIN users u ON u.id = r.generated_by
     ${where}
     ORDER BY r.reference_month DESC`,
    params,
  );
  res.json({ reports: rows });
});

// Registra a geracao de um relatorio (o PDF em si e gerado pelo PHP).
// Evita duplicidade pelo indice unico (reference_month, type).
export const generateReport = asyncHandler(async (req, res) => {
  const referenceMonth = req.body?.reference_month;
  const type = req.body?.type || 'manual';
  const filePath = req.body?.file_path || null;
  const metadata = req.body?.metadata || null;

  if (!/^\d{4}-\d{2}$/.test(referenceMonth || '')) {
    return res.status(400).json({ error: 'reference_month deve estar no formato YYYY-MM.' });
  }

  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO monthly_reports (reference_month, generated_by, file_path, type, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (reference_month, type) DO UPDATE
           SET generated_at = NOW(), generated_by = EXCLUDED.generated_by,
               file_path = EXCLUDED.file_path, metadata = EXCLUDED.metadata
         RETURNING *`,
        [referenceMonth, req.user.id, filePath, type, metadata ? JSON.stringify(metadata) : null],
      );
      return rows[0];
    });
    const { ip, userAgent } = getClientMeta(req);
    await writeAudit({
      userId: req.user.id, action: 'generate_report', entityType: 'report', entityId: result.id,
      newValues: { referenceMonth, type }, ip, userAgent,
    });
    res.status(201).json({ report: result });
  } catch (err) {
    logger.error('Falha ao gerar relatorio', { error: err.message });
    return res.status(500).json({ error: 'Nao foi possivel registrar o relatorio.' });
  }
});

export const getReport = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query('SELECT * FROM monthly_reports WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Relatorio nao encontrado.' });
  res.json({ report: rows[0] });
});

export default { listReports, generateReport, getReport };
