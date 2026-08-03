/**
 * Análise do lote — as perguntas que a operadora precisa responder olhando o
 * lote inteiro, antes de sair lançando cheque por cheque:
 *
 *   1. Quanto desse lote pode voltar do banco? (o número que custa dinheiro)
 *   2. Quando esses cheques vencem? (o cronograma da operação)
 *   3. Qual problema está se repetindo? (alerta agrupado por tipo, não uma
 *      lista de 40 linhas soltas)
 *   4. Quanto do trabalho já está lançado?
 *
 * Puro, sem React — testável e reaproveitado pela exportação.
 */

import { resumirLote, type ResumoLote } from './lote'
import type { ChequeRow } from './supabase/types'
import type { NivelAlerta } from './validation/types'

/** Data que manda: bom_para coerente, senão a escrita no cheque. */
function dataDoCheque(cheque: ChequeRow): string | null {
  return cheque.data_efetiva || cheque.bom_para || cheque.data_emissao || null
}

function valor(cheque: ChequeRow): number {
  return Number(cheque.valor_numerico ?? 0)
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100
}

const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]

export function rotuloDoMes(mes: string): string {
  const [ano, numero] = mes.split('-')
  const indice = Number(numero) - 1
  if (!MESES_CURTOS[indice]) return mes
  return `${MESES_CURTOS[indice]}/${ano.slice(2)}`
}

export interface Vencimento {
  /** `YYYY-MM`. */
  mes: string
  rotulo: string
  /** Total do mês. */
  total: number
  /** Parte do total que está em cheque com alerta vermelho. */
  risco: number
  quantidade: number
}

export interface FaixaValor {
  valor: number
  cheques: number
}

export interface AlertaAgrupado {
  codigo: string
  nivel: NivelAlerta
  titulo: string
  quantidade: number
  /** Valor somado dos cheques afetados — dimensiona o problema em reais. */
  valorAfetado: number
  chequeIds: string[]
  exemplo: string
  /** Números do primeiro alerta do grupo, para a tela de explicação. */
  dados?: Record<string, string | number>
}

export interface AnaliseLote {
  resumo: ResumoLote
  emitentes: number
  /** Cheques que o banco pode devolver: é o número que a ferramenta existe para achar. */
  emRisco: FaixaValor
  aConferir: FaixaValor
  liberados: FaixaValor
  /** Cheques sem data legível — não entram no cronograma. */
  semData: FaixaValor
  cronograma: Vencimento[]
  alertasPorTipo: AlertaAgrupado[]
  primeiroVencimento: string | null
  ultimoVencimento: string | null
}

/** Preenche os meses vazios entre o primeiro e o último para o cronograma não mentir. */
function preencherMeses(meses: string[]): string[] {
  if (meses.length === 0) return []
  const ordenados = [...meses].sort()
  const [anoInicio, mesInicio] = ordenados[0].split('-').map(Number)
  const [anoFim, mesFim] = ordenados[ordenados.length - 1].split('-').map(Number)

  const totalMeses = (anoFim - anoInicio) * 12 + (mesFim - mesInicio) + 1
  // Ano errado lido pelo modelo geraria centenas de colunas vazias; nesse caso
  // mostramos só os meses que existem e o alerta amarelo de data cuida do resto.
  if (totalMeses > 24) return ordenados

  const saida: string[] = []
  for (let i = 0; i < totalMeses; i += 1) {
    const bruto = (anoInicio * 12 + (mesInicio - 1) + i)
    const ano = Math.floor(bruto / 12)
    const mes = (bruto % 12) + 1
    saida.push(`${ano}-${String(mes).padStart(2, '0')}`)
  }
  return saida
}

export function analisarLote(cheques: ChequeRow[]): AnaliseLote {
  const resumo = resumirLote(cheques)

  const emRisco: FaixaValor = { valor: 0, cheques: 0 }
  const aConferir: FaixaValor = { valor: 0, cheques: 0 }
  const liberados: FaixaValor = { valor: 0, cheques: 0 }
  const semData: FaixaValor = { valor: 0, cheques: 0 }

  const porMes = new Map<string, Vencimento>()
  const porTipo = new Map<string, AlertaAgrupado>()
  const emitentes = new Set<string>()

  for (const cheque of cheques) {
    const v = valor(cheque)
    emitentes.add(cheque.emitente_normalizado || '')

    const faixa =
      cheque.status === 'vermelho' ? emRisco : cheque.status === 'conferir' ? aConferir : liberados
    faixa.valor += v
    faixa.cheques += 1

    const data = dataDoCheque(cheque)
    if (data) {
      const mes = data.slice(0, 7)
      let item = porMes.get(mes)
      if (!item) {
        item = { mes, rotulo: rotuloDoMes(mes), total: 0, risco: 0, quantidade: 0 }
        porMes.set(mes, item)
      }
      item.total += v
      item.quantidade += 1
      if (cheque.status === 'vermelho') item.risco += v
    } else {
      semData.valor += v
      semData.cheques += 1
    }

    for (const alerta of cheque.alertas ?? []) {
      let grupo = porTipo.get(alerta.codigo)
      if (!grupo) {
        grupo = {
          codigo: alerta.codigo,
          nivel: alerta.nivel,
          titulo: alerta.titulo,
          quantidade: 0,
          valorAfetado: 0,
          chequeIds: [],
          exemplo: alerta.detalhe,
          dados: alerta.dados,
        }
        porTipo.set(alerta.codigo, grupo)
      }
      grupo.quantidade += 1
      grupo.valorAfetado += v
      if (!grupo.chequeIds.includes(cheque.id)) grupo.chequeIds.push(cheque.id)
    }
  }

  const cronograma = preencherMeses([...porMes.keys()]).map(
    (mes) =>
      porMes.get(mes) ?? { mes, rotulo: rotuloDoMes(mes), total: 0, risco: 0, quantidade: 0 },
  )

  for (const item of cronograma) {
    item.total = arredondar(item.total)
    item.risco = arredondar(item.risco)
  }

  // Vermelhos primeiro; dentro do nível, o que mais se repete na frente.
  const alertasPorTipo = [...porTipo.values()].sort((a, b) => {
    if (a.nivel !== b.nivel) return a.nivel === 'vermelho' ? -1 : 1
    if (a.quantidade !== b.quantidade) return b.quantidade - a.quantidade
    return a.titulo.localeCompare(b.titulo, 'pt-BR')
  })
  for (const grupo of alertasPorTipo) grupo.valorAfetado = arredondar(grupo.valorAfetado)

  const comData = cronograma.filter((m) => m.quantidade > 0)

  return {
    resumo,
    emitentes: emitentes.size,
    emRisco: { valor: arredondar(emRisco.valor), cheques: emRisco.cheques },
    aConferir: { valor: arredondar(aConferir.valor), cheques: aConferir.cheques },
    liberados: { valor: arredondar(liberados.valor), cheques: liberados.cheques },
    semData: { valor: arredondar(semData.valor), cheques: semData.cheques },
    cronograma,
    alertasPorTipo,
    primeiroVencimento: comData[0]?.mes ?? null,
    ultimoVencimento: comData[comData.length - 1]?.mes ?? null,
  }
}
