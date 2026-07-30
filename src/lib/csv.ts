/** Exportação do lote em CSV, no formato que a conferência usa. */

import { formatarDataBr } from './validation/datas'
import type { ChequeRow } from './supabase/types'
import { agruparPorEmitente } from './lote'

const COLUNAS = [
  'emitente',
  'banco',
  'agencia',
  'conta',
  'numero',
  'data',
  'bom_para',
  'valor',
  'cmc7',
  'status',
  'alertas',
  'lancado',
] as const

/** BOM (U+FEFF) e CRLF, escritos sem escape para não sumirem numa edição. */
const BOM = String.fromCharCode(0xfeff)
const CRLF = String.fromCharCode(13, 10)

function escapar(valor: string): string {
  if (/[";\n\r]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`
  return valor
}

/** Vírgula é separador decimal em pt-BR, então o CSV usa ponto e vírgula. */
export function loteParaCsv(cheques: ChequeRow[]): string {
  const linhas: string[] = [COLUNAS.join(';')]

  for (const grupo of agruparPorEmitente(cheques)) {
    for (const cheque of grupo.cheques) {
      const alertas = (cheque.alertas ?? [])
        .map((a) => `${a.nivel === 'vermelho' ? '[VERMELHO]' : '[AMARELO]'} ${a.titulo}`)
        .join(' | ')

      linhas.push(
        [
          grupo.rotulo,
          cheque.banco_nome || cheque.banco_codigo || '',
          cheque.agencia ?? '',
          cheque.conta ?? '',
          cheque.numero_cheque ?? '',
          cheque.data_emissao ? formatarDataBr(cheque.data_emissao) : '',
          cheque.bom_para ? formatarDataBr(cheque.bom_para) : '',
          cheque.valor_numerico === null
            ? ''
            : Number(cheque.valor_numerico).toFixed(2).replace('.', ','),
          cheque.cmc7_completo ?? '',
          cheque.status,
          alertas,
          cheque.lancado ? 'sim' : 'nao',
        ]
          .map((c) => escapar(String(c)))
          .join(';'),
      )
    }
  }

  // BOM para o Excel em pt-BR abrir com acento correto.
  return BOM + linhas.join(CRLF) + CRLF
}

export function nomeArquivoCsv(nomeLote: string | null, criadoEm: string): string {
  const base = (nomeLote || 'lote')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return `${base || 'lote'}-${criadoEm.slice(0, 10)}.csv`
}
