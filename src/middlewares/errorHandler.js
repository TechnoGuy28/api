import logger from '../utils/logger.js';

// Encapsula handlers async para capturar rejeicoes e repassar ao error handler.
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Trata erros de violacao de unicidade do Postgres.
function mapPgError(err) {
  if (err.code === '23505') {
    const detail = err.detail || '';
    if (detail.includes('users_name')) return { status: 409, message: 'Nome de usuario ja existe.' };
    if (detail.includes('publications_code')) return { status: 409, message: 'Codigo de publicacao ja existe.' };
    if (detail.includes('categories_name')) return { status: 409, message: 'Categoria ja existe.' };
    return { status: 409, message: 'Registro duplicado.' };
  }
  if (err.code === '23503') return { status: 400, message: 'Registro vinculado ausente ou invalido.' };
  if (err.code === '23514') return { status: 400, message: 'Valor invalido para o campo.' };
  return null;
}

export function errorHandler(err, req, res, _next) {
  const mapped = mapPgError(err);
  if (mapped) {
    logger.warn('Conflito de dados', { message: mapped.message });
    return res.status(mapped.status).json({ error: mapped.message });
  }
  const status = err.status || 500;
  if (status >= 500) {
    logger.error('Erro interno', { message: err.message, path: req.originalUrl });
  }
  // Nunca expoe stack trace ao cliente.
  res.status(status).json({
    error: status >= 500 ? 'Erro interno do servidor.' : (err.message || 'Requisicao invalida.'),
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Recurso nao encontrado.' });
}

export default { asyncHandler, errorHandler, notFoundHandler };
