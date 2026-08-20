/** Formatação e parse de valores monetários em pt-BR (ex.: 1.500,00). */

export function formatCurrencyBRL(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Converte texto digitado (com ou sem máscara) para número. */
export function parseCurrencyBRL(raw: string): number {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits) / 100;
}

/**
 * Aplica máscara BRL a partir da digitação: só dígitos, últimos 2 = centavos.
 * Ex.: "150000" → "1.500,00"
 */
export function maskCurrencyBRLInput(raw: string): string {
  return formatCurrencyBRL(parseCurrencyBRL(raw));
}
