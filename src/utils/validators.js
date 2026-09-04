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
// Tipos de movimentacao de estoque/exposicao:
//   in           -> entrada (soma no estoque)
//   out          -> saida (desconta da exposicao)
//   to_exposure  -> do estoque para a exposicao
//   to_stock     -> da exposicao para o estoque
export const VALID_MOVEMENT_TYPES = ['in', 'out', 'to_exposure', 'to_stock'];

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
 * Calcula os contadores resultantes (estoque e exposicao) de uma movimentacao.
 * Retorna { stock, exposure } com os novos valores.
 */
export function computeResulting(type, { stock, exposure }, quantity) {
  switch (type) {
    case 'in':
      return { stock: stock + quantity, exposure };
    case 'out':
      return { stock, exposure: exposure - quantity };
    case 'to_exposure':
      return { stock: stock - quantity, exposure: exposure + quantity };
    case 'to_stock':
      return { stock: stock + quantity, exposure: exposure - quantity };
    default:
      return { stock, exposure }; // tipo invalido: mantido (validateMovement recusa antes)
  }
}

/**
 * Valida uma movimentacao de estoque/exposicao segundo as regras de negocio.
 * `state` = { stock, exposure } (contadores atuais).
 */
export function validateMovement({ type, state, quantity }) {
  if (!isValidMovementType(type)) {
    return { ok: false, error: 'Tipo de movimentacao invalido.' };
  }
  const q = parseQuantity(quantity);
  if (!q.ok) return q;

  const stock = state?.stock;
  const exposure = state?.exposure;
  if (stock === undefined || stock === null || stock < 0) {
    return { ok: false, error: 'Estoque atual invalido.' };
  }
  if (exposure === undefined || exposure === null || exposure < 0) {
    return { ok: false, error: 'Exposicao atual invalido.' };
  }

  if (type === 'out' && q.value > exposure) {
    return {
      ok: false,
      error: `Exposicao insuficiente: ha ${exposure} em exposicao e a saida e de ${q.value}.`,
    };
  }
  if (type === 'to_exposure' && q.value > stock) {
    return {
      ok: false,
      error: `Estoque insuficiente: ha ${stock} em estoque e a transferencia para exposicao e de ${q.value}.`,
    };
  }
  if (type === 'to_stock' && q.value > exposure) {
    return {
      ok: false,
      error: `Exposicao insuficiente: ha ${exposure} em exposicao e a transferencia para estoque e de ${q.value}.`,
    };
  }

  const resulting = computeResulting(type, { stock, exposure }, q.value);
  if (resulting.stock < 0 || resulting.exposure < 0) {
    return { ok: false, error: 'Operacao resultaria em estoque ou exposicao negativo.' };
  }

  return { ok: true, value: q.value, resulting };
}

export default {
  toDigits, isValidPhone, formatWhatsappLink, normalizeName, normalizeCode,
  isValidStatus, isValidMovementType, parseQuantity, computeResulting, validateMovement,
};
