/**
 * CMC7 — dígito verificador e cruzamento com os campos impressos.
 *
 * Layout (padrão brasileiro, 30 dígitos em 3 blocos):
 *
 *   bloco 1 — 8 dígitos:  banco (3) + agência (4) + DV (1)
 *   bloco 2 — 12 dígitos: tipificação + número do cheque (6) + ... + DV (1)
 *   bloco 3 — 10 dígitos: conta corrente (9) + DV (1)
 *
 * DV de cada bloco: módulo 10 com pesos alternados 2 e 1 sobre os dígitos de
 * dados, produto > 9 reduzido pela soma dos próprios algarismos (equivalente a
 * Luhn), e DV = (10 - soma % 10) % 10.
 *
 * Detalhe que evita uma classe inteira de bug: os três blocos têm quantidade
 * ÍMPAR de dígitos de dados (7, 11 e 9), então alternar os pesos da esquerda
 * para a direita ou da direita para a esquerda dá exatamente o mesmo resultado.
 * A implementação não depende dessa escolha.
 */

import type { DigitoDuvidoso } from './types'

export type NumeroBloco = 1 | 2 | 3

export const TAMANHO_BLOCO: Record<NumeroBloco, number> = { 1: 8, 2: 12, 3: 10 }

/**
 * Como o bloco é chamado na tela. "Bloco 2" não diz nada para quem confere;
 * "2º grupo (número do cheque)" diz onde olhar na tarja.
 */
export const NOME_BLOCO: Record<NumeroBloco, string> = {
  1: '1º grupo (banco e agência)',
  2: '2º grupo (número do cheque)',
  3: '3º grupo (conta)',
}

/** "7º" — para apontar a posição do dígito sem falar em índice. */
export function ordinal(posicao: number): string {
  return `${posicao}º`
}

export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '')
}

/** DV módulo 10 (Luhn) dos dígitos de dados de um bloco. */
export function calcularDv(dados: string): number {
  const digitos = somenteDigitos(dados)
  if (!digitos) return 0
  let soma = 0
  // Peso 2 no dígito mais à direita dos dados, alternando para a esquerda.
  for (let i = 0; i < digitos.length; i += 1) {
    const posDaDireita = digitos.length - 1 - i
    const peso = posDaDireita % 2 === 0 ? 2 : 1
    let produto = Number(digitos[i]) * peso
    if (produto > 9) produto -= 9
    soma += produto
  }
  return (10 - (soma % 10)) % 10
}

export interface ChecagemBloco {
  bloco: NumeroBloco
  presente: boolean
  digitos: string
  tamanhoEsperado: number
  tamanhoOk: boolean
  /** DV lido do próprio bloco (último dígito). */
  dvLido: string | null
  /** DV que o cálculo diz que deveria estar ali. */
  dvEsperado: string | null
  dvOk: boolean
}

/** Confere o DV de um bloco isolado, sem tocar em dígitos duvidosos. */
export function checarBloco(bloco: NumeroBloco, valor: string | null | undefined): ChecagemBloco {
  const digitos = somenteDigitos(valor)
  const tamanhoEsperado = TAMANHO_BLOCO[bloco]
  if (digitos.length < 2) {
    return {
      bloco,
      presente: digitos.length > 0,
      digitos,
      tamanhoEsperado,
      tamanhoOk: false,
      dvLido: null,
      dvEsperado: null,
      dvOk: false,
    }
  }
  const dados = digitos.slice(0, -1)
  const dvLido = digitos.slice(-1)
  const dvEsperado = String(calcularDv(dados))
  return {
    bloco,
    presente: true,
    digitos,
    tamanhoEsperado,
    tamanhoOk: digitos.length === tamanhoEsperado,
    dvLido,
    dvEsperado,
    dvOk: dvLido === dvEsperado,
  }
}

export interface CombinacaoValida {
  bloco: NumeroBloco
  blocoCorrigido: string
  /** Que dígito foi escolhido em cada posição duvidosa. */
  escolhas: Array<{ posicao: number; digito: string }>
}

const MAX_COMBINACOES = 4096

/**
 * Testa todas as combinações das alternativas dos dígitos duvidosos e devolve
 * SOMENTE as que fecham o DV. Zero resultados = refotografar.
 */
export function combinacoesQueFecham(
  bloco: NumeroBloco,
  valor: string | null | undefined,
  duvidosos: DigitoDuvidoso[],
): CombinacaoValida[] {
  const digitos = somenteDigitos(valor)
  if (digitos.length < 2) return []

  const doBloco = duvidosos
    .filter((d) => d.bloco === bloco)
    .filter((d) => d.posicao >= 1 && d.posicao <= digitos.length)
    .map((d) => ({
      posicao: d.posicao,
      // O dígito que o modelo já escreveu conta como candidato: ele pode estar
      // certo mesmo estando marcado como duvidoso.
      alternativas: Array.from(
        new Set(
          [...d.alternativas, digitos[d.posicao - 1]]
            .map((a) => somenteDigitos(a))
            .filter((a) => a.length === 1),
        ),
      ),
    }))
    .filter((d) => d.alternativas.length > 0)

  if (doBloco.length === 0) return []

  const total = doBloco.reduce((acc, d) => acc * d.alternativas.length, 1)
  if (total > MAX_COMBINACOES) return []

  const validas: CombinacaoValida[] = []

  const percorrer = (indice: number, atual: string, escolhas: CombinacaoValida['escolhas']) => {
    if (indice === doBloco.length) {
      const dados = atual.slice(0, -1)
      if (String(calcularDv(dados)) === atual.slice(-1)) {
        validas.push({ bloco, blocoCorrigido: atual, escolhas: [...escolhas] })
      }
      return
    }
    const { posicao, alternativas } = doBloco[indice]
    for (const digito of alternativas) {
      const proximo = atual.slice(0, posicao - 1) + digito + atual.slice(posicao)
      percorrer(indice + 1, proximo, [...escolhas, { posicao, digito }])
    }
  }

  percorrer(0, digitos, [])
  return validas
}

/** String única do CMC7, com os blocos separados por espaço. Vazio se faltar bloco. */
export function montarCmc7Completo(
  bloco1: string | null | undefined,
  bloco2: string | null | undefined,
  bloco3: string | null | undefined,
): string | null {
  const blocos = [bloco1, bloco2, bloco3].map(somenteDigitos)
  if (blocos.some((b) => b.length === 0)) return null
  return blocos.join(' ')
}

/** Versão sem separadores — é o que costuma ser digitado no sistema da empresa. */
export function cmc7Cru(
  bloco1: string | null | undefined,
  bloco2: string | null | undefined,
  bloco3: string | null | undefined,
): string | null {
  const completo = montarCmc7Completo(bloco1, bloco2, bloco3)
  return completo ? completo.replace(/\s/g, '') : null
}

/** Banco impresso no cabeçalho vs. os 3 primeiros dígitos do bloco 1. */
export function bancoDoBloco1(bloco1: string | null | undefined): string | null {
  const d = somenteDigitos(bloco1)
  return d.length >= 3 ? d.slice(0, 3) : null
}

/** Agência impressa no cabeçalho vs. os dígitos 4-7 do bloco 1. */
export function agenciaDoBloco1(bloco1: string | null | undefined): string | null {
  const d = somenteDigitos(bloco1)
  return d.length >= 7 ? d.slice(3, 7) : null
}
