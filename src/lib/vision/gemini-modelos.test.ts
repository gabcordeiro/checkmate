import { beforeEach, describe, expect, it } from 'vitest'
import {
  CANDIDATOS_PADRAO,
  candidatos,
  escolherMelhor,
  fixarModelo,
  limparCacheDeModelo,
  pontuarModelo,
} from './gemini-modelos'

beforeEach(() => {
  limparCacheDeModelo()
})

describe('pontuarModelo', () => {
  it('descarta o que não serve para ler cheque', () => {
    for (const nome of [
      'text-embedding-004',
      'gemini-2.0-flash-live-001',
      'gemini-2.5-flash-image-generation',
      'gemini-2.5-flash-preview-tts',
      'imagen-3.0-generate-002',
    ]) {
      expect(pontuarModelo(nome), nome).toBeLessThan(0)
    }
  })

  it('prefere flash a pro (custo por cheque) e versão mais nova', () => {
    expect(pontuarModelo('gemini-2.5-flash')).toBeGreaterThan(pontuarModelo('gemini-2.5-pro'))
    expect(pontuarModelo('gemini-3-flash')).toBeGreaterThan(pontuarModelo('gemini-2.5-flash'))
  })

  it('penaliza lite: economiza mais e erra mais dígito', () => {
    expect(pontuarModelo('gemini-2.5-flash')).toBeGreaterThan(
      pontuarModelo('gemini-2.5-flash-lite'),
    )
  })

  it('prefere o apelido -latest ao nome fixo da mesma família', () => {
    expect(pontuarModelo('gemini-flash-latest')).toBeGreaterThan(pontuarModelo('gemini-flash'))
  })
})

describe('escolherMelhor', () => {
  it('escolhe o flash mais novo de uma lista real', () => {
    const escolhido = escolherMelhor([
      'gemini-1.5-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'text-embedding-004',
    ])
    expect(escolhido).toBe('gemini-2.5-flash')
  })

  it('devolve null quando nada na lista serve', () => {
    expect(escolherMelhor(['text-embedding-004', 'imagen-3.0-generate-002'])).toBeNull()
  })

  it('aceita nome que não conhecemos, se for gemini e pontuar', () => {
    expect(escolherMelhor(['gemini-4-flash'])).toBe('gemini-4-flash')
  })
})

describe('candidatos', () => {
  it('sem env nem cache, usa a lista padrão com o apelido na frente', () => {
    expect(candidatos()).toEqual(CANDIDATOS_PADRAO)
    expect(candidatos()[0]).toBe('gemini-flash-latest')
  })

  it('o modelo da env vem antes dos padrões', () => {
    expect(candidatos('gemini-3-pro-preview')[0]).toBe('gemini-3-pro-preview')
  })

  it('o modelo que já funcionou vem primeiro, para não repetir a descoberta', () => {
    fixarModelo('gemini-9-flash')
    expect(candidatos('gemini-3-pro-preview')[0]).toBe('gemini-9-flash')
  })

  it('não repete nome', () => {
    const lista = candidatos('gemini-2.5-flash')
    expect(new Set(lista).size).toBe(lista.length)
  })
})
