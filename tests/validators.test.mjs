import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDigits, isValidPhone, formatWhatsappLink, normalizeName, normalizeCode,
  isValidStatus, isValidMovementType, parseQuantity, computeResulting, validateMovement,
} from '../src/utils/validators.js';

test('toDigits remove caracteres nao numericos', () => {
  assert.equal(toDigits('(11) 91234-5678'), '11912345678');
  assert.equal(toDigits(null), '');
});

test('isValidPhone aceita 10 a 15 digitos', () => {
  assert.equal(isValidPhone('11912345678'), true);
  assert.equal(isValidPhone('123'), false);
  assert.equal(isValidPhone('(11) 91234-5678'), true);
});

test('formatWhatsappLink monta link wa.me', () => {
  assert.equal(formatWhatsappLink('(11) 91234-5678'), 'https://wa.me/11912345678');
  assert.equal(formatWhatsappLink(''), '');
});

test('normalizeName e normalizeCode fazem trim', () => {
  assert.equal(normalizeName('  Livro  '), 'Livro');
  assert.equal(normalizeCode('  ABC-1 '), 'ABC-1');
});

test('isValidStatus e isValidMovementType', () => {
  assert.equal(isValidStatus('active'), true);
  assert.equal(isValidStatus('ativo'), false);
  for (const t of ['in', 'out', 'to_exposure', 'to_stock']) {
    assert.equal(isValidMovementType(t), true, `deveria aceitar ${t}`);
  }
  assert.equal(isValidMovementType('adjust'), false);
  assert.equal(isValidMovementType('x'), false);
});

test('parseQuantity exige inteiro maior que zero', () => {
  assert.equal(parseQuantity(0).ok, false);
  assert.equal(parseQuantity(-1).ok, false);
  assert.equal(parseQuantity(1.5).ok, false);
  assert.equal(parseQuantity('x').ok, false);
  assert.deepEqual(parseQuantity(5), { ok: true, value: 5 });
});

test('computeResulting: in soma no estoque e mantem exposicao', () => {
  assert.deepEqual(computeResulting('in', { stock: 10, exposure: 4 }, 3), { stock: 13, exposure: 4 });
});

test('computeResulting: out desconta da exposicao', () => {
  assert.deepEqual(computeResulting('out', { stock: 10, exposure: 4 }, 3), { stock: 10, exposure: 1 });
});

test('computeResulting: to_exposure move estoque -> exposicao', () => {
  assert.deepEqual(computeResulting('to_exposure', { stock: 10, exposure: 4 }, 3), { stock: 7, exposure: 7 });
});

test('computeResulting: to_stock move exposicao -> estoque', () => {
  assert.deepEqual(computeResulting('to_stock', { stock: 10, exposure: 4 }, 3), { stock: 13, exposure: 1 });
});

test('validateMovement: in valido', () => {
  const ok = validateMovement({ type: 'in', state: { stock: 5, exposure: 2 }, quantity: 3 });
  assert.deepEqual(ok, { ok: true, value: 3, resulting: { stock: 8, exposure: 2 } });
});

test('validateMovement: out desconta da exposicao', () => {
  const ok = validateMovement({ type: 'out', state: { stock: 5, exposure: 4 }, quantity: 3 });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.resulting, { stock: 5, exposure: 1 });
});

test('validateMovement: out com exposicao insuficiente e rejeitado', () => {
  const bad = validateMovement({ type: 'out', state: { stock: 20, exposure: 4 }, quantity: 10 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /exposicao insuficiente/i);
});

test('validateMovement: to_exposure satisfaz', () => {
  const ok = validateMovement({ type: 'to_exposure', state: { stock: 10, exposure: 0 }, quantity: 4 });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.resulting, { stock: 6, exposure: 4 });
});

test('validateMovement: to_exposure com estoque insuficiente e rejeitado', () => {
  const bad = validateMovement({ type: 'to_exposure', state: { stock: 3, exposure: 0 }, quantity: 10 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /estoque insuficiente/i);
});

test('validateMovement: to_stock satisfaz', () => {
  const ok = validateMovement({ type: 'to_stock', state: { stock: 0, exposure: 10 }, quantity: 4 });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.resulting, { stock: 4, exposure: 6 });
});

test('validateMovement: to_stock com exposicao insuficiente e rejeitado', () => {
  const bad = validateMovement({ type: 'to_stock', state: { stock: 0, exposure: 3 }, quantity: 10 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /exposicao insuficiente/i);
});

test('validateMovement rejeita tipo invalido, quantidade invalida e estado invalido', () => {
  assert.equal(validateMovement({ type: 'adjust', state: { stock: 5, exposure: 0 }, quantity: 3 }).ok, false);
  assert.equal(validateMovement({ type: 'x', state: { stock: 5, exposure: 0 }, quantity: 3 }).ok, false);
  assert.equal(validateMovement({ type: 'in', state: { stock: 5, exposure: 0 }, quantity: 0 }).ok, false);
  const noState = validateMovement({ type: 'in', quantity: 3 });
  assert.equal(noState.ok, false);
  const zeroExposure = validateMovement({ type: 'in', state: { stock: 5, exposure: -1 }, quantity: 3 });
  assert.equal(zeroExposure.ok, false);
});