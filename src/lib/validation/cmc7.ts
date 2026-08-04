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

/** Marca de "não consegui ler este caractere". */
export const ILEGIVEL = '?'

export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '')
}

/**
 * Dígitos E as marcas de ilegível, na ordem — é o valor que a tela mostra.
 *
 * Diferente de `somenteDigitos`, que descarta o `?`: descartar encurtaria o
 * bloco silenciosamente e faria o verificador ser calculado sobre dados
 * errados, acusando erro onde não há.
 */
export function digitosELacunas(valor: string | null | undefined): string {
  return (valor ?? '').replace(/[^0-9?]/g, '')
}

export function temIlegivel(valor: string | null | undefined): boolean {
  return digitosELacunas(valor).includes(ILEGIVEL)
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
  /** Dígitos e `?`, como será mostrado na tela. */
  digitos: string
  /** Algum caractere não foi lido. */
  ilegivel: boolean
  tamanhoEsperado: number
  tamanhoOk: boolean
  /**
   * Se dá para afirmar alguma coisa sobre a conferência interna do bloco.
   * Falso quando falta caractere, sobra caractere ou há `?` — nesses casos o
   * cálculo rodaria sobre dados que não são os do cheque.
   */
  avaliavel: boolean
  /** Último dígito lido do bloco. Null quando não avaliável. */
  dvLido: string | null
  /** O que o cálculo diz que deveria estar ali. Null quando não avaliável. */
  dvEsperado: string | null
  /** Só `false` quando avaliável e realmente não fecha. */
  dvOk: boolean
}

/**
 * Confere o bloco isolado.
 *
 * Regra que consertou um falso positivo real: a conferência interna só é
 * calculada quando o bloco está íntegro (tamanho certo e sem `?`). Antes ela
 * rodava sempre — então um bloco lido com 9 dígitos em vez de 8 gerava DOIS
 * alertas para a mesma causa, e o segundo dizia que um número estava errado
 * quando o problema era outro. Sem base para afirmar, não se afirma.
 */
export function checarBloco(bloco: NumeroBloco, valor: string | null | undefined): ChecagemBloco {
  const digitos = digitosELacunas(valor)
  const tamanhoEsperado = TAMANHO_BLOCO[bloco]
  const ilegivel = digitos.includes(ILEGIVEL)
  const tamanhoOk = digitos.length === tamanhoEsperado
  const avaliavel = digitos.length >= 2 && tamanhoOk && !ilegivel

  if (!avaliavel) {
    return {
      bloco,
      presente: digitos.length > 0,
      digitos,
      ilegivel,
      tamanhoEsperado,
      tamanhoOk,
      avaliavel: false,
      dvLido: null,
      dvEsperado: null,
      dvOk: true,
    }
  }

  const dados = digitos.slice(0, -1)
  const dvLido = digitos.slice(-1)
  const dvEsperado = String(calcularDv(dados))
  return {
    bloco,
    presente: true,
    digitos,
    ilegivel: false,
    tamanhoEsperado,
    tamanhoOk: true,
    avaliavel: true,
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
 * SOMENTE as que fecham a conferência interna.
 *
 * "Duvidoso" aqui é o caractere que o modelo LEU mas pode ser 3 ou 8 — não o
 * que ele não conseguiu ler (esse vira `?` e não tem alternativa a testar).
 * Bloco com `?` ou com tamanho fora do padrão não é avaliado: o cálculo rodaria
 * sobre dados que não são os do cheque.
 */
export function combinacoesQueFecham(
  bloco: NumeroBloco,
  valor: string | null | undefined,
  duvidosos: DigitoDuvidoso[],
): CombinacaoValida[] {
  if (!checarBloco(bloco, valor).avaliavel) return []
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

/**
 * String única do CMC7, com os blocos separados por espaço. Vazio se faltar bloco.
 *
 * Preserva o `?`: é o valor que fica guardado no banco e que a tela consulta
 * para saber se ainda há lacuna. Se aqui a lacuna sumisse, o número gravado
 * pareceria completo — e a operadora copiaria para o sistema da empresa um
 * CMC7 mais curto que o do cheque, sem nada avisando.
 */
export function montarCmc7Completo(
  bloco1: string | null | undefined,
  bloco2: string | null | undefined,
  bloco3: string | null | undefined,
): string | null {
  const blocos = [bloco1, bloco2, bloco3].map(digitosELacunas)
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

/**
 * Recorte posicional do bloco 1, com `?` contando como caractere.
 *
 * Descartar a lacuna deslocaria os dígitos seguintes e o recorte devolveria
 * outro número — que então seria comparado com o impresso e acusaria uma
 * divergência inventada. Com lacuna dentro do recorte, não há o que comparar.
 */
function recorteBloco1(
  bloco1: string | null | undefined,
  inicio: number,
  fim: number,
): string | null {
  const d = digitosELacunas(bloco1)
  if (d.length < fim) return null
  const trecho = d.slice(inicio, fim)
  return trecho.includes(ILEGIVEL) ? null : trecho
}

/** Banco impresso no cabeçalho vs. os 3 primeiros dígitos do bloco 1. */
export function bancoDoBloco1(bloco1: string | null | undefined): string | null {
  return recorteBloco1(bloco1, 0, 3)
}

/** Agência impressa no cabeçalho vs. os dígitos 4-7 do bloco 1. */
export function agenciaDoBloco1(bloco1: string | null | undefined): string | null {
  return recorteBloco1(bloco1, 3, 7)
}
