import bcrypt from 'bcryptjs';
import { query } from '../src/db.js';

/**
 * Cria ou redefine (upsert) um usuario administrador + senha.
 *
 * Uso:
 *   node scripts/reset-admin-password.js [usuario] [senha]
 *   ADMIN_USER=joao ADMIN_PASSWORD=secreta node scripts/reset-admin-password.js
 *
 * Defaults: usuario "admin", senha "admin123"
 */
const user = process.env.ADMIN_USER || process.argv[2] || 'admin';
const password = process.env.ADMIN_PASSWORD || process.argv[3] || 'admin123';

const hash = bcrypt.hashSync(password, 10);

try {
  const exists = await query('SELECT 1 FROM users WHERE LOWER(name) = LOWER($1)', [user]);
  if (exists.rows.length > 0) {
    await query('UPDATE users SET password_hash = $1 WHERE LOWER(name) = LOWER($2)', [hash, user]);
    console.log(`Senha do usuario '${user}' redefinida com sucesso.`);
  } else {
    await query(
      'INSERT INTO users (name, password_hash, phone, active) VALUES ($1, $2, NULL, TRUE)',
      [user, hash]
    );
    console.log(`Usuario '${user}' criado com sucesso.`);
  }
  console.log(`Login: ${user} / ${password}`);
  process.exit(0);
} catch (err) {
  console.error('Falha ao criar/redefinir usuario. Verifique DATABASE_URL em .env.');
  console.error(err);
  process.exit(1);
}
