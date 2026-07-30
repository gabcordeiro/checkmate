/**
 * Datas do cheque.
 *
 * O caso que dá prejuízo: a operadora combina o vencimento pelo "bom para"
 * anotado à mão, mas o banco compensa pela data ESCRITA no cheque. Se o
 * "bom para" é anterior à emissão, o cheque pode ser apresentado antes do
 * combinado — e voltar.
 */

/** Aceita apenas ISO `YYYY-MM-DD` e confere se a data existe de verdade. */
export function parseDataIso(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const ano = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  // Rejeita 31/02 e companhia: o Date normaliza silenciosamente.
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null
  }
  return data
}

export function formatarDataBr(valor: string | null | undefined): string {
  const data = parseDataIso(valor)
  if (!data) return '—'
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getUTCFullYear()}`
}

export function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** Hoje em UTC, zerado — usado como referência das janelas de plausibilidade. */
export function hojeUtc(referencia: Date = new Date()): Date {
  return new Date(
    Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), referencia.getUTCDate()),
  )
}

/** Cheque prescreve em 6 meses após o prazo de apresentação; antes disso é suspeito de leitura errada. */
export const DIAS_PASSADO_SUSPEITO = 365
export const DIAS_FUTURO_SUSPEITO = 366
