/** Formatação usada tanto na validação (mensagens de alerta) quanto na UI. */

export function formatarBRL(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  return (
    valor
      .toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      // O Intl usa espaço não-quebrável depois do "R$". Trocamos por espaço
      // comum para o valor sobreviver a copiar/colar, CSV e comparação em teste.
      .replace(/\s/g, ' ')
  )
}

/** Caixa alta, sem acento, espaços colapsados — a chave de agrupamento por emitente. */
export function normalizarEmitente(nome: string | null | undefined): string {
  const limpo = (nome ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return limpo || 'EMITENTE NÃO IDENTIFICADO'
}

/** CMC7 legível: blocos separados, para leitura humana na conferência. */
export function formatarCmc7(completo: string | null | undefined): string {
  if (!completo) return '—'
  return completo.trim()
}
