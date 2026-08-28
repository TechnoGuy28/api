import { query } from '../db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { writeAudit } from '../utils/audit.js';
import { getClientMeta } from '../utils/request.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

const VALID_KINDS = ['general', 'monthly', 'dashboard', 'publications', 'audit'];

// Lista os documentos PDF gerados (historico), mais recentes primeiro.
export const listDocuments = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT d.*, u.name AS generated_by_name
     FROM generated_pdfs d
     LEFT JOIN users u ON u.id = d.generated_by
     ORDER BY d.generated_at DESC`,
  );
  res.json({ documents: rows });
});

// Registra a criacao de um documento PDF (o arquivo ja foi gravado pelo PHP).
export const createDocument = asyncHandler(async (req, res) => {
  const kind = req.body?.kind;
  const title = req.body?.title;
  const filePath = req.body?.file_path;
  const referencePeriod = req.body?.reference_period || null;

  if (!VALID_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'kind invalido.' });
  }
  if (!title || !filePath) {
    return res.status(400).json({ error: 'title e file_path sao obrigatorios.' });
  }

  const { rows } = await query(
    `INSERT INTO generated_pdfs (kind, title, file_path, reference_period, generated_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [kind, title, filePath, referencePeriod, req.user.id],
  );
  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'create_document', entityType: 'document', entityId: rows[0].id,
    newValues: { kind, title, referencePeriod }, ip, userAgent,
  });
  res.status(201).json({ document: rows[0] });
});

// Remove o registro e tenta apagar o arquivo fisico (no host da API, se existir).
export const deleteDocument = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query('SELECT * FROM generated_pdfs WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Documento nao encontrado.' });

  const filePath = rows[0].file_path;
  await query('DELETE FROM generated_pdfs WHERE id = $1', [id]);

  // O arquivo fisico vive no host PHP; a API so tenta remover se por acaso
  // estiver no mesmo filesystem (ex.: ambiente de desenvolvimento).
  if (filePath) {
    try {
      const abs = path.resolve(process.env.REPORTS_DIR || 'storage/reports', path.basename(filePath));
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (err) {
      logger.warn('Nao foi possivel remover o arquivo fisico do documento', { error: err.message });
    }
  }

  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'delete_document', entityType: 'document', entityId: id,
    oldValues: { kind: rows[0].kind, title: rows[0].title }, ip, userAgent,
  });
  res.json({ ok: true });
});

export default { listDocuments, createDocument, deleteDocument };
