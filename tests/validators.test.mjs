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
  assert.equal(isValidMovementType('in'), true);
  assert.equal(isValidMovementType('x'), false);
});

test('parseQuantity exige inteiro maior que zero', () => {
  assert.equal(parseQuantity(0).ok, false);
  assert.equal(parseQuantity(-1).ok, false);
  assert.equal(parseQuantity(1.5).ok, false);
  assert.deepEqual(parseQuantity(5), { ok: true, value: 5 });
});

test('computeResulting por tipo', () => {
  assert.equal(computeResulting('in', 10, 3), 13);
  assert.equal(computeResulting('out', 10, 3), 7);
  assert.equal(computeResulting('adjust', 10, 20), 20);
});

test('validateMovement bloqueia saida maior que estoque', () => {
  const ok = validateMovement({ type: 'out', previousQuantity: 5, quantity: 3 });
  assert.equal(ok.ok, true);
  assert.equal(ok.resulting, 2);
  const bad = validateMovement({ type: 'out', previousQuantity: 5, quantity: 10 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /estoque disponivel/);
});

test('validateMovement rejeita tipo invalido e quantidade invalida', () => {
  assert.equal(validateMovement({ type: 'x', previousQuantity: 5, quantity: 3 }).ok, false);
  assert.equal(validateMovement({ type: 'in', previousQuantity: 5, quantity: 0 }).ok, false);
});
