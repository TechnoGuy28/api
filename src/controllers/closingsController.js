import { query, withTransaction } from '../db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { writeAudit } from '../utils/audit.js';
import { getClientMeta } from '../utils/request.js';
import logger from '../utils/logger.js';

// Registra um fechamento: armazena o saldo atual de todas as publicacoes ativas.
// Isso vira o "ultimo fechamento" consultado pelos relatorios (saldo anterior).
export const createClosing = asyncHandler(async (req, res) => {
  const referenceMonth = req.body?.reference_month || null;
  const type = req.body?.type || 'monthly';

  const { rows: pubs } = await query(
    `SELECT id, quantity FROM publications WHERE deleted_at IS NULL`,
  );

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO closings (reference_month, generated_by, type, closed_at)
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [referenceMonth, req.user.id, type],
    );
    const closing = rows[0];
    for (const p of pubs) {
      await client.query(
        `INSERT INTO closing_items (closing_id, publication_id, quantity)
         VALUES ($1, $2, $3)`,
        [closing.id, p.id, p.quantity],
      );
    }
    return closing;
  });

  const { ip, userAgent } = getClientMeta(req);
  await writeAudit({
    userId: req.user.id, action: 'create_closing', entityType: 'closing', entityId: result.id,
    newValues: { referenceMonth, type, publications: pubs.length }, ip, userAgent,
  });
  res.status(201).json({ closing: result, items: pubs });
});

// Retorna o fechamento mais recente e o mapa de saldos { publication_id: quantity }.
// Se nenhum fechamento existir, devolve { closing: null, items: {} } (os relatorios
// usam entao um calculo matematico de fallback).
export const getLastClosing = asyncHandler(async (req, res) => {
  const { rows: closings } = await query(
    `SELECT * FROM closings ORDER BY closed_at DESC LIMIT 1`,
  );
  if (!closings[0]) {
    return res.json({ closing: null, items: {} });
  }
  const closing = closings[0];
  const { rows: items } = await query(
    `SELECT publication_id, quantity FROM closing_items WHERE closing_id = $1`,
    [closing.id],
  );
  const map = {};
  for (const it of items) map[String(it.publication_id)] = Number(it.quantity);
  res.json({ closing, items: map });
});

// Lista historico de fechamentos (cabecalho apenas).
export const listClosings = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, reference_month, closed_at, generated_by, type
     FROM closings ORDER BY closed_at DESC`,
  );
  res.json({ closings: rows });
});

export default { createClosing, getLastClosing, listClosings };
