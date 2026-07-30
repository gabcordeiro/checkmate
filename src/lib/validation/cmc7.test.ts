import { describe, expect, it } from 'vitest'
import {
  agenciaDoBloco1,
  bancoDoBloco1,
  calcularDv,
  checarBloco,
  cmc7Cru,
  combinacoesQueFecham,
  montarCmc7Completo,
} from './cmc7'

/**
 * Fixtures coerentes com o layout real (8/12/10 dígitos), com DV calculado:
 *   bloco1 74801630  → banco 748, agência 0163, DV 0
 *   bloco2 001001234564 → contém o nº do cheque 123456, DV 4
 *   bloco3 0001234566 → conta 123456, DV 6
 */
export const BLOCO1_OK = '74801630'
export const BLOCO2_OK = '001001234564'
export const BLOCO3_OK = '0001234566'

describe('calcularDv', () => {
  it('fecha os três blocos das fixtures', () => {
    expect(String(calcularDv('7480163'))).toBe('0')
    expect(String(calcularDv('00100123456'))).toBe('4')
    expect(String(calcularDv('000123456'))).toBe('6')
  })

  it('ignora separadores e caracteres não numéricos', () => {
    expect(calcularDv('748.0163')).toBe(calcularDv('7480163'))
  })

  it('devolve 0 para entrada vazia em vez de estourar', () => {
    expect(calcularDv('')).toBe(0)
  })
})

describe('checarBloco', () => {
  it('aprova bloco com DV correto e tamanho correto', () => {
    const r = checarBloco(1, BLOCO1_OK)
    expect(r.dvOk).toBe(true)
    expect(r.tamanhoOk).toBe(true)
    expect(r.dvLido).toBe('0')
  })

  it('reprova DV errado apontando o esperado', () => {
    const r = checarBloco(1, '74801637')
    expect(r.dvOk).toBe(false)
    expect(r.dvLido).toBe('7')
    expect(r.dvEsperado).toBe('0')
  })

  it('detecta tamanho fora do padrão sem deixar de calcular o DV', () => {
    const r = checarBloco(1, '7480163')
    expect(r.tamanhoOk).toBe(false)
    expect(r.presente).toBe(true)
  })

  it('marca bloco ausente', () => {
    const r = checarBloco(2, null)
    expect(r.presente).toBe(false)
    expect(r.dvOk).toBe(false)
  })
})

describe('combinacoesQueFecham', () => {
  it('resolve o clássico 3/8: só o 3 fecha o verificador', () => {
    // Modelo leu "...68 0" onde o correto é "...63 0".
    const combinacoes = combinacoesQueFecham(1, '74801680', [
      { bloco: 1, posicao: 7, alternativas: ['8', '3'] },
    ])
    expect(combinacoes).toHaveLength(1)
    expect(combinacoes[0].blocoCorrigido).toBe(BLOCO1_OK)
    expect(combinacoes[0].escolhas).toEqual([{ posicao: 7, digito: '3' }])
  })

  it('resolve 0/8 no meio da agência', () => {
    const combinacoes = combinacoesQueFecham(1, '74881630', [
      { bloco: 1, posicao: 4, alternativas: ['8', '0'] },
    ])
    expect(combinacoes).toHaveLength(1)
    expect(combinacoes[0].blocoCorrigido).toBe(BLOCO1_OK)
  })

  it('devolve vazio quando nenhuma alternativa fecha (caso "refotografar")', () => {
    const combinacoes = combinacoesQueFecham(1, '74801680', [
      { bloco: 1, posicao: 7, alternativas: ['8', '9'] },
    ])
    expect(combinacoes).toEqual([])
  })

  it('considera o dígito já escrito pelo modelo como candidato', () => {
    // Bloco já fecha; a alternativa errada não deve invalidá-lo.
    const combinacoes = combinacoesQueFecham(1, BLOCO1_OK, [
      { bloco: 1, posicao: 7, alternativas: ['8'] },
    ])
    expect(combinacoes).toHaveLength(1)
    expect(combinacoes[0].blocoCorrigido).toBe(BLOCO1_OK)
  })

  it('só olha os duvidosos do bloco pedido', () => {
    const combinacoes = combinacoesQueFecham(1, '74801680', [
      { bloco: 2, posicao: 7, alternativas: ['8', '3'] },
    ])
    expect(combinacoes).toEqual([])
  })

  it('ignora posição fora do bloco', () => {
    const combinacoes = combinacoesQueFecham(1, '74801680', [
      { bloco: 1, posicao: 99, alternativas: ['3'] },
    ])
    expect(combinacoes).toEqual([])
  })
})

describe('montagem e leitura dos campos', () => {
  it('monta o CMC7 completo com blocos separados', () => {
    expect(montarCmc7Completo(BLOCO1_OK, BLOCO2_OK, BLOCO3_OK)).toBe(
      `${BLOCO1_OK} ${BLOCO2_OK} ${BLOCO3_OK}`,
    )
  })

  it('devolve null se faltar bloco', () => {
    expect(montarCmc7Completo(BLOCO1_OK, null, BLOCO3_OK)).toBeNull()
  })

  it('gera a versão crua de 30 dígitos para digitar no sistema', () => {
    const cru = cmc7Cru(BLOCO1_OK, BLOCO2_OK, BLOCO3_OK)
    expect(cru).toBe(`${BLOCO1_OK}${BLOCO2_OK}${BLOCO3_OK}`)
    expect(cru).toHaveLength(30)
  })

  it('extrai banco e agência do bloco 1', () => {
    expect(bancoDoBloco1(BLOCO1_OK)).toBe('748')
    expect(agenciaDoBloco1(BLOCO1_OK)).toBe('0163')
  })
})
