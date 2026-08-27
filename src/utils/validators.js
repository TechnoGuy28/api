// Funcoes de validacao PURAS (sem dependencia de banco).
// Sao reutilizadas pela API e cobertas por testes de regressao.

export function toDigits(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '');
}

export function isValidPhone(value) {
  const digits = toDigits(value);
  return /^\d{10,15}$/.test(digits);
}

export function formatWhatsappLink(phone) {
  const digits = toDigits(phone);
  if (!digits) return '';
  return `https://wa.me/${digits}`;
}

export function normalizeName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeCode(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export const VALID_STATUS = ['active', 'inactive'];
export const VALID_MOVEMENT_TYPES = ['in', 'out', 'adjust'];

export function isValidStatus(value) {
  return VALID_STATUS.includes(value);
}

export function isValidMovementType(value) {
  return VALID_MOVEMENT_TYPES.includes(value);
}

/**
 * Valida e converte uma quantidade.
 * Deve ser inteiro maior que zero.
 */
export function parseQuantity(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) {
    return { ok: false, error: 'Quantidade deve ser um numero inteiro.' };
  }
  if (n <= 0) {
    return { ok: false, error: 'Quantidade deve ser maior que zero.' };
  }
  return { ok: true, value: n };
}

/**
 * Calcula a quantidade resultante de uma movimentacao.
 * in: soma; out: subtrai; adjust: define valor absoluto.
 */
export function computeResulting(type, previous, quantity) {
  if (type === 'in') return previous + quantity;
  if (type === 'out') return previous - quantity;
  return quantity; // adjust
}

/**
 * Valida uma movimentacao de estoque segundo as regras de negocio.
 */
export function validateMovement({ type, previousQuantity, quantity }) {
  if (!isValidMovementType(type)) {
    return { ok: false, error: 'Tipo de movimentacao invalido.' };
  }
  const q = parseQuantity(quantity);
  if (!q.ok) return q;

  if (previousQuantity === undefined || previousQuantity === null || previousQuantity < 0) {
    return { ok: false, error: 'Estoque atual invalido.' };
  }

  if (type === 'out' && q.value > previousQuantity) {
    return {
      ok: false,
      error: `Saida (${q.value}) maior que o estoque disponivel (${previousQuantity}).`,
    };
  }

  const resulting = computeResulting(type, previousQuantity, q.value);
  if (resulting < 0) {
    return { ok: false, error: 'Operacao resultaria em estoque negativo.' };
  }

  return { ok: true, value: q.value, resulting };
}

export default {
  toDigits, isValidPhone, formatWhatsappLink, normalizeName, normalizeCode,
  isValidStatus, isValidMovementType, parseQuantity, computeResulting, validateMovement,
};
