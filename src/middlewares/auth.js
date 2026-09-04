import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-to-a-long-random-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Middleware de autenticacao via Bearer JWT.
 * Anexa req.user = { id, name, role } quando valido. Tokens emitidos antes da
 * coluna de papel existir sao tratados como 'master' (preserva o acesso atual).
 */
const LEGACY_ROLE = 'master';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token de autenticacao ausente ou invalido.' });
  }
  try {
    const decoded = verifyToken(token);
    req.user = {
      id: decoded.sub,
      name: decoded.name,
      role: decoded.role || LEGACY_ROLE,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido ou expirado.' });
  }
}

export default { signToken, verifyToken, authMiddleware };
