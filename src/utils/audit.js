import logger from './logger.js';

/**
 * Grava um evento de auditoria na tabela audit_logs.
 * Pode receber um `client` de transacao opcional; caso contrario usa o pool.
 */
export async function writeAudit(event) {
  const {
    userId = null,
    action,
    entityType,
    entityId = null,
    oldValues = null,
    newValues = null,
    ip = null,
    userAgent = null,
    client = null,
  } = event;

  const q = `
    INSERT INTO audit_logs
      (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;
  const params = [
    userId,
    action,
    entityType,
    entityId,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    ip,
    userAgent,
  ];
  try {
    if (client) {
      await client.query(q, params);
    } else {
      const { query: run } = await import('../db.js');
      await run(q, params);
    }
  } catch (err) {
    // Auditoria nunca deve quebrar a operacao principal.
    logger.error('Falha ao gravar auditoria', { error: err.message });
  }
}

export default writeAudit;
