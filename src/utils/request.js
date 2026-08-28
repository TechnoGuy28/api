export function getClientMeta(req) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.headers['user-agent'] || null;
  return { ip, userAgent };
}

/**
 * Extrai um cursor de sincronizacao incremental a partir de ?since= (ISO 8601).
 * Retorna um objeto Date valido ou null quando ausente/ invalido.
 * Usado para que o cliente traga apenas o que mudou desde o ultimo sync.
 */
export function parseSince(req) {
  const raw = req.query?.since;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export default getClientMeta;
