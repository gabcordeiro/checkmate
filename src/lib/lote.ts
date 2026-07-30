/**
 * Organização do lote: agrupamento por emitente e resumo de alertas.
 * Puro, sem React — usado tanto na tela quanto na exportação.
 */

import { normalizarEmitente } from './format'
import type { ChequeRow } from './supabase/types'
import type { Alerta } from './validation/types'

/**
 * Genérico no tipo do cheque para a tela poder agrupar linhas já enriquecidas
 * (com a URL assinada da foto, por exemplo) sem perder esse campo.
 */
export interface GrupoEmitente<T extends ChequeRow = ChequeRow> {
  chave: string
  /** Nome como aparece no cheque (o primeiro encontrado no grupo). */
  rotulo: string
  cheques: T[]
  subtotal: number
  vermelhos: number
  amarelos: number
}

/** Cheques sem data vão para o fim: não dá para posicioná-los na fila. */
function chaveDeOrdem(cheque: ChequeRow): string {
  return cheque.data_efetiva || cheque.bom_para || cheque.data_emissao || '9999-12-31'
}

export function agruparPorEmitente<T extends ChequeRow>(cheques: T[]): GrupoEmitente<T>[] {
  const grupos = new Map<string, GrupoEmitente<T>>()

  for (const cheque of cheques) {
    const chave = cheque.emitente_normalizado || normalizarEmitente(cheque.emitente)
    let grupo = grupos.get(chave)
    if (!grupo) {
      grupo = {
        chave,
        rotulo: cheque.emitente?.trim() || chave,
        cheques: [],
        subtotal: 0,
        vermelhos: 0,
        amarelos: 0,
      }
      grupos.set(chave, grupo)
    }
    grupo.cheques.push(cheque)
    grupo.subtotal += Number(cheque.valor_numerico ?? 0)
    if (cheque.status === 'vermelho') grupo.vermelhos += 1
    else if (cheque.status === 'conferir') grupo.amarelos += 1
  }

  for (const grupo of grupos.values()) {
    grupo.cheques.sort((a, b) => {
      const porData = chaveDeOrdem(a).localeCompare(chaveDeOrdem(b))
      if (porData !== 0) return porData
      return (a.numero_cheque ?? '').localeCompare(b.numero_cheque ?? '')
    })
    grupo.subtotal = Math.round(grupo.subtotal * 100) / 100
  }

  // Emitente com problema vermelho primeiro; depois por nome.
  return [...grupos.values()].sort((a, b) => {
    if (a.vermelhos !== b.vermelhos) return b.vermelhos - a.vermelhos
    return a.chave.localeCompare(b.chave, 'pt-BR')
  })
}

export interface ResumoLote {
  quantidade: number
  total: number
  vermelhos: number
  amarelos: number
  lancados: number
}

export function resumirLote(cheques: ChequeRow[]): ResumoLote {
  let total = 0
  let vermelhos = 0
  let amarelos = 0
  let lancados = 0

  for (const cheque of cheques) {
    total += Number(cheque.valor_numerico ?? 0)
    // Conta ALERTAS, não cheques: "3 alertas vermelhos" é o que a operadora
    // precisa resolver, e um cheque pode ter mais de um.
    for (const alerta of cheque.alertas ?? []) {
      if (alerta.nivel === 'vermelho') vermelhos += 1
      else amarelos += 1
    }
    if (cheque.lancado) lancados += 1
  }

  return {
    quantidade: cheques.length,
    total: Math.round(total * 100) / 100,
    vermelhos,
    amarelos,
    lancados,
  }
}

export interface AlertaComCheque {
  cheque: ChequeRow
  alerta: Alerta
}

/** Todos os alertas do lote, vermelhos primeiro, com o cheque de origem. */
export function alertasDoLote(cheques: ChequeRow[]): AlertaComCheque[] {
  const lista: AlertaComCheque[] = []
  for (const cheque of cheques) {
    for (const alerta of cheque.alertas ?? []) lista.push({ cheque, alerta })
  }
  return lista.sort((a, b) => {
    if (a.alerta.nivel === b.alerta.nivel) return 0
    return a.alerta.nivel === 'vermelho' ? -1 : 1
  })
}
