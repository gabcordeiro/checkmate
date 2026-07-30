import { describe, expect, it } from 'vitest'
import { parseExtenso } from './extenso'

const valor = (texto: string) => parseExtenso(texto).valor

describe('parseExtenso — números básicos', () => {
  it('unidades, dezenas e centenas', () => {
    expect(valor('cinco')).toBe(5)
    expect(valor('quinze')).toBe(15)
    expect(valor('vinte e cinco')).toBe(25)
    expect(valor('cem')).toBe(100)
    expect(valor('cento e vinte')).toBe(120)
    expect(valor('oitocentos e quarenta e dois')).toBe(842)
    expect(valor('novecentos e noventa e nove')).toBe(999)
  })

  it('milhares', () => {
    expect(valor('mil')).toBe(1000)
    expect(valor('mil e quinhentos')).toBe(1500)
    expect(valor('dois mil e quinhentos')).toBe(2500)
    expect(valor('mil oitocentos e quarenta e dois')).toBe(1842)
    expect(valor('cem mil')).toBe(100000)
    expect(valor('cento e cinquenta mil')).toBe(150000)
  })

  it('milhões', () => {
    expect(valor('um milhao')).toBe(1000000)
    expect(valor('um milhão e quinhentos mil')).toBe(1500000)
    expect(valor('tres milhoes duzentos e cinquenta mil e setecentos')).toBe(3250700)
  })
})

describe('parseExtenso — jeito que aparece em cheque de verdade', () => {
  it('aceita "hum mil" (grafia comum em cheque)', () => {
    expect(valor('hum mil oitocentos e quarenta e dois reais')).toBe(1842)
  })

  it('aceita caixa alta, acento e asteriscos de preenchimento', () => {
    expect(valor('*** UM MIL OITOCENTOS E QUARENTA E DOIS REAIS ***')).toBe(1842)
  })

  it('aceita R$ colado no texto', () => {
    expect(valor('R$ mil e quinhentos reais')).toBe(1500)
  })

  it('tolera erros de grafia do manuscrito', () => {
    expect(valor('quatrossentos reais')).toBe(400)
    expect(valor('dusentos e cincoenta reais')).toBe(250)
    expect(valor('tresentos e secenta reais')).toBe(360)
    expect(valor('quinhetos reais')).toBe(500)
    expect(valor('mil e novessentos reais')).toBe(1900)
  })

  it('lê hífen como separador', () => {
    expect(valor('vinte-e-cinco reais')).toBe(25)
  })
})

describe('parseExtenso — centavos', () => {
  it('reais e centavos explícitos', () => {
    expect(valor('mil oitocentos e quarenta e dois reais e cinquenta centavos')).toBe(1842.5)
    expect(valor('cem reais e noventa e nove centavos')).toBe(100.99)
  })

  it('centavos sem a palavra "centavos", depois de "reais"', () => {
    expect(valor('mil e oitocentos reais e quarenta e dois')).toBe(1800.42)
  })

  it('fração /100', () => {
    expect(valor('mil oitocentos e quarenta e dois reais e 50/100')).toBe(1842.5)
  })

  it('só centavos', () => {
    expect(valor('cinquenta centavos')).toBe(0.5)
    expect(valor('noventa e nove centavos')).toBe(0.99)
  })

  it('reais + centavos sem a palavra "reais"', () => {
    expect(valor('quinhentos e cinquenta centavos')).toBe(500.5)
  })
})

describe('parseExtenso — casos degenerados', () => {
  it('texto vazio ou nulo não é interpretado', () => {
    for (const entrada of ['', '   ', null, undefined]) {
      const r = parseExtenso(entrada)
      expect(r.valor).toBeNull()
      expect(r.interpretado).toBe(false)
    }
  })

  it('texto sem nenhum numeral não é interpretado', () => {
    const r = parseExtenso('ilegível rasurado')
    expect(r.interpretado).toBe(false)
    expect(r.valor).toBeNull()
  })

  it('reporta palavras não reconhecidas sem desistir do valor', () => {
    const r = parseExtenso('mil xpto reais')
    expect(r.valor).toBe(1000)
    expect(r.palavrasIgnoradas).toContain('xpto')
  })

  it('não confunde "e" solto', () => {
    expect(valor('mil e reais')).toBe(1000)
  })
})

describe('parseExtenso — o caso real que motivou o produto', () => {
  it('extenso "quatrocentos" contra numérico 1.842,00 dá valores diferentes', () => {
    // Cheque real: extenso escrito errado pelo emitente. O banco paga 400.
    expect(valor('quatrocentos reais')).toBe(400)
    expect(valor('quatrocentos reais')).not.toBe(1842)
  })
})
