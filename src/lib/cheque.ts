/**
 * Ponte entre a linha do banco e o objeto que a validação entende.
 *
 * Existe para que a correção manual da operadora passe pela MESMA validação da
 * extração: ela conserta um dígito do CMC7 e o DV é recalculado; conserta a
 * transcrição do extenso e o parser roda de novo. Sem isso a correção viraria
 * um campo editado com um alerta velho pendurado nele.
 */

import { normalizarEmitente } from './format'
import { cmc7Cru, montarCmc7Completo } from './validation/cmc7'
import { ordenarAlertas, statusDosAlertas, validarCheque } from './validation'
import type { Alerta, ChequeExtraido, Confianca } from './validation/types'
import type { ChequeRow } from './supabase/types'

/** Campos que a operadora pode corrigir na tela. */
export const CAMPOS_EDITAVEIS = [
  'emitente',
  'nominal',
  'numero_cheque',
  'banco_codigo',
  'agencia',
  'conta',
  'valor_numerico',
  'valor_extenso_texto',
  'data_emissao',
  'bom_para',
  'cmc7_bloco1',
  'cmc7_bloco2',
  'cmc7_bloco3',
  'assinatura_presente',
] as const

export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number]

export type EdicaoCheque = Partial<{
  emitente: string | null
  nominal: string | null
  numero_cheque: string | null
  banco_codigo: string | null
  agencia: string | null
  conta: string | null
  valor_numerico: number | null
  valor_extenso_texto: string | null
  data_emissao: string | null
  bom_para: string | null
  cmc7_bloco1: string | null
  cmc7_bloco2: string | null
  cmc7_bloco3: string | null
  assinatura_presente: boolean
}>

/** Reconstrói o objeto extraído a partir da linha persistida. */
export function linhaParaExtraido(linha: ChequeRow): ChequeExtraido {
  return {
    banco_codigo: linha.banco_codigo,
    banco_nome: linha.banco_nome,
    agencia: linha.agencia,
    conta: linha.conta,
    numero_cheque: linha.numero_cheque,
    cmc7: {
      bloco1: linha.cmc7_bloco1,
      bloco2: linha.cmc7_bloco2,
      bloco3: linha.cmc7_bloco3,
      digitos_duvidosos: linha.digitos_duvidosos ?? [],
    },
    valor_numerico: linha.valor_numerico === null ? null : Number(linha.valor_numerico),
    valor_extenso_texto: linha.valor_extenso_texto,
    data_emissao: linha.data_emissao,
    bom_para_anotado: linha.bom_para,
    nominal: linha.nominal,
    emitente: linha.emitente,
    cidade_praca: linha.cidade,
    assinatura_presente: linha.assinatura_presente === true,
    rasuras_detectadas: linha.rasuras ?? [],
    confianca_por_campo: (linha.confianca ?? {}) as Record<string, Confianca>,
    observacoes: linha.observacoes,
  }
}

/** Aplica a correção da operadora sobre o extraído. */
export function aplicarEdicao(base: ChequeExtraido, edicao: EdicaoCheque): ChequeExtraido {
  const cmc7 = { ...base.cmc7 }

  for (const bloco of [1, 2, 3] as const) {
    const chave = `cmc7_bloco${bloco}` as const
    if (!(chave in edicao)) continue
    cmc7[`bloco${bloco}`] = edicao[chave] ?? null
    // Ela leu o bloco na foto: as dúvidas do modelo naquele bloco não valem mais.
    cmc7.digitos_duvidosos = cmc7.digitos_duvidosos.filter((d) => d.bloco !== bloco)
  }

  return {
    ...base,
    cmc7,
    emitente: 'emitente' in edicao ? (edicao.emitente ?? null) : base.emitente,
    nominal: 'nominal' in edicao ? (edicao.nominal ?? null) : base.nominal,
    numero_cheque:
      'numero_cheque' in edicao ? (edicao.numero_cheque ?? null) : base.numero_cheque,
    banco_codigo: 'banco_codigo' in edicao ? (edicao.banco_codigo ?? null) : base.banco_codigo,
    agencia: 'agencia' in edicao ? (edicao.agencia ?? null) : base.agencia,
    conta: 'conta' in edicao ? (edicao.conta ?? null) : base.conta,
    valor_numerico:
      'valor_numerico' in edicao ? (edicao.valor_numerico ?? null) : base.valor_numerico,
    valor_extenso_texto:
      'valor_extenso_texto' in edicao
        ? (edicao.valor_extenso_texto ?? null)
        : base.valor_extenso_texto,
    data_emissao: 'data_emissao' in edicao ? (edicao.data_emissao ?? null) : base.data_emissao,
    bom_para_anotado: 'bom_para' in edicao ? (edicao.bom_para ?? null) : base.bom_para_anotado,
    assinatura_presente:
      'assinatura_presente' in edicao
        ? edicao.assinatura_presente === true
        : base.assinatura_presente,
  }
}

/**
 * Colunas derivadas de um cheque extraído: o que a extração e a revisão manual
 * gravam. Uma função só, para os dois caminhos nunca divergirem.
 *
 * `alertasExtras` são avisos que não saem do conteúdo do cheque e sim das
 * condições da leitura — hoje, foto abaixo da resolução recomendada. Entram na
 * mesma lista e no mesmo cálculo de status: se a operadora escolheu seguir com
 * uma foto ruim, o lote inteiro precisa carregar esse aviso, senão ele morre no
 * clique e ninguém mais sabe.
 */
export function colunasDoCheque(cheque: ChequeExtraido, alertasExtras: Alerta[] = []) {
  const validacao = validarCheque(cheque)
  const alertas = ordenarAlertas([...validacao.alertas, ...alertasExtras])
  const { bloco1, bloco2, bloco3 } = cheque.cmc7

  return {
    emitente: cheque.emitente,
    emitente_normalizado: normalizarEmitente(cheque.emitente),
    banco_codigo: cheque.banco_codigo,
    banco_nome: cheque.banco_nome,
    agencia: cheque.agencia,
    conta: cheque.conta,
    numero_cheque: cheque.numero_cheque,
    cmc7_bloco1: bloco1,
    cmc7_bloco2: bloco2,
    cmc7_bloco3: bloco3,
    // Os 30 dígitos crus: é o que vai para o clipboard e para o CSV.
    cmc7_completo: cmc7Cru(bloco1, bloco2, bloco3) ?? montarCmc7Completo(bloco1, bloco2, bloco3),
    digitos_duvidosos: cheque.cmc7.digitos_duvidosos,
    cmc7_sugestoes: validacao.cmc7_sugestoes,
    valor_numerico: cheque.valor_numerico,
    valor_extenso_texto: cheque.valor_extenso_texto,
    valor_extenso_convertido: validacao.valor_extenso_convertido,
    data_emissao: cheque.data_emissao,
    bom_para: cheque.bom_para_anotado,
    data_efetiva: validacao.data_efetiva,
    nominal: cheque.nominal,
    cidade: cheque.cidade_praca,
    assinatura_presente: cheque.assinatura_presente,
    rasuras: cheque.rasuras_detectadas,
    confianca: cheque.confianca_por_campo,
    observacoes: cheque.observacoes,
    status: statusDosAlertas(alertas),
    alertas,
  }
}
