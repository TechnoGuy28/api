import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/server.js';
import { initDatabase } from '../src/db/init.js';

// Executa apenas quando ha um banco PostgreSQL real configurado.
const hasDb = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dummy');

// Garante schema + seed antes dos testes (idempotente).
before(async () => {
  if (hasDb) {
    await initDatabase();
  }
});

const opts = hasDb ? {} : { skip: 'sem banco de dados real (defina DATABASE_URL com Neon)' };

let token;
let categoryId;
let publicationId;

test('login retorna token', opts, async () => {
  const res = await request(app).post('/auth/login').send({ name: 'admin', password: 'admin123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  token = res.body.token;
});

test('cria categoria', opts, async () => {
  const res = await request(app).post('/categories').set('Authorization', `Bearer ${token}`).send({ name: 'TesteCat' });
  assert.equal(res.status, 201);
  categoryId = res.body.category.id;
});

test('cria publicacao com estoque inicial', opts, async () => {
  const res = await request(app)
    .post('/publications')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Livro Teste', code: 'TST-1', category_id: categoryId, initial_quantity: 10 });
  assert.equal(res.status, 201);
  assert.equal(res.body.publication.quantity, 10);
  publicationId = res.body.publication.id;
});

test('movimentacao de saida e entrada atualiza estoque', opts, async () => {
  const out = await request(app)
    .post(`/publications/${publicationId}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'out', quantity: 3 });
  assert.equal(out.status, 201);
  assert.equal(out.body.current_quantity, 7);

  const inc = await request(app)
    .post(`/publications/${publicationId}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'in', quantity: 5 });
  assert.equal(inc.body.current_quantity, 12);
});

test('saida maior que estoque e rejeitada', opts, async () => {
  const res = await request(app)
    .post(`/publications/${publicationId}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'out', quantity: 99999 });
  assert.equal(res.status, 400);
});

test('historico mensal e lista de movimentos', opts, async () => {
  const m = await request(app).get(`/publications/${publicationId}/movements`).set('Authorization', `Bearer ${token}`);
  assert.equal(m.status, 200);
  assert.ok(m.body.movements.length >= 2);
  const h = await request(app).get(`/publications/${publicationId}/history/monthly`).set('Authorization', `Bearer ${token}`);
  assert.equal(h.status, 200);
  assert.ok(h.body.monthly.length >= 1);
});

test('dashboard summary responde', opts, async () => {
  const res = await request(app).get('/dashboard/summary').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.total_publications === 'number');
});

test('auditoria registra eventos', opts, async () => {
  const res = await request(app).get('/audit/logs').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.logs.length >= 1);
});

test('configuracao de fechamento', opts, async () => {
  const res = await request(app).put('/settings/closing-day').set('Authorization', `Bearer ${token}`).send({ closing_day: 5 });
  assert.equal(res.status, 200);
  assert.equal(res.body.settings.closing_day, '5');
});

test('gera relatorio (registro)', opts, async () => {
  const res = await request(app)
    .post('/reports/generate')
    .set('Authorization', `Bearer ${token}`)
    .send({ reference_month: '2000-01', type: 'manual' });
  assert.equal(res.status, 201);
});
