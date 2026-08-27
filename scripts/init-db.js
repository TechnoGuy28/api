import { initDatabase } from '../src/db/init.js';

initDatabase().then((ok) => {
  if (ok) {
    console.log('Banco inicializado com sucesso.');
    process.exit(0);
  } else {
    console.error('Falha ao inicializar o banco. Verifique DATABASE_URL em .env.');
    process.exit(1);
  }
});
