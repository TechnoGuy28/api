/**
 * Controle de acesso por papel (role). Ordem de privilegio:
 *   leitor < master < total
 * Deve ser usado APOS authMiddleware (req.user.role ja preenchido).
 */
export const ROLES = {
  LEITOR: 'leitor',
  MASTER: 'master',
  TOTAL: 'total',
};

export const ADMIN_ROLES = [ROLES.MASTER, ROLES.TOTAL];

/**
 * Middleware de autorizacao: requisicoes de usuarios fora dos papeis listados
 * recebem 403. Uso: router.post('/', requireRole('master', 'total'), ctrl.x);
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (role && roles.includes(role)) return next();
    return res.status(403).json({ error: 'Você não tem permissão para esta ação.' });
  };
}

export default { ROLES, ADMIN_ROLES, requireRole };