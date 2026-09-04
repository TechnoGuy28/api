import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signToken, authMiddleware } from './auth.js';

function call(token) {
  const req = token ? { headers: { authorization: `Bearer ${token}` } } : { headers: {} };
  const res = { status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  let passed = false;
  authMiddleware(req, res, () => { passed = true; });
  return { req, res, passed };
}

describe('authMiddleware', () => {
  it('preenche req.user com id, name e role quando o token valido tem role', () => {
    const token = signToken({ sub: '1', name: 'admin', role: 'master' });
    const r = call(token);
    assert.equal(r.passed, true);
    assert.equal(r.req.user.id, '1');
    assert.equal(r.req.user.name, 'admin');
    assert.equal(r.req.user.role, 'master');
  });

  it('trata token emitido antes da coluna role como master (legacy)', () => {
    const token = signToken({ sub: '2', name: 'legado' });
    const r = call(token);
    assert.equal(r.passed, true);
    assert.equal(r.req.user.role, 'master');
  });

  it('rejeita com 401 quando nao ha header de autorizacao', () => {
    const r = call(null);
    assert.equal(r.passed, false);
    assert.equal(r.res.code, 401);
  });

  it('rejeita com 401 token invalido', () => {
    const r = call('token-aleatorio');
    assert.equal(r.passed, false);
    assert.equal(r.res.code, 401);
  });
});