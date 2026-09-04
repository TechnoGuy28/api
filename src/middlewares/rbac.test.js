import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireRole, ADMIN_ROLES, ROLES } from './rbac.js';

function run(role, ...roles) {
  const req = { user: { role } };
  const res = { status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  let passed = false;
  requireRole(...roles)(req, res, () => { passed = true; });
  return { passed, code: res.code, error: res.body && res.body.error };
}

describe('requireRole', () => {
  it('deixa master passar em rotas administrativas', () => {
    const r = run(ROLES.MASTER, ...ADMIN_ROLES);
    assert.equal(r.passed, true);
    assert.equal(r.code, undefined);
  });

  it('deixa total passar em rotas administrativas', () => {
    const r = run(ROLES.TOTAL, ...ADMIN_ROLES);
    assert.equal(r.passed, true);
    assert.equal(r.code, undefined);
  });

  it('bloqueia leitor em rotas administrativas com 403', () => {
    const r = run(ROLES.LEITOR, ...ADMIN_ROLES);
    assert.equal(r.passed, false);
    assert.equal(r.code, 403);
    assert.ok(r.error);
  });

  it('bloqueia master em rotas exclusivas do total', () => {
    const r = run(ROLES.MASTER, ROLES.TOTAL);
    assert.equal(r.passed, false);
    assert.equal(r.code, 403);
  });

  it('bloqueia quando nao ha role (defesa em profundidade)', () => {
    const r = run(undefined, ...ADMIN_ROLES);
    assert.equal(r.passed, false);
    assert.equal(r.code, 403);
  });
});