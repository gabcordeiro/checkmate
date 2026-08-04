import { describe, expect, it } from 'vitest'
import { explicarAlerta } from './explicacoes'
import { validarCheque } from './validation'
import type { ChequeExtraido } from './validation/types'

const BLOCO1_OK = '74801630'
const BLOCO2_OK = '001001234564'
const BLOCO3_OK = '0001234566'
const HOJE = new Date(Date.UTC(2026, 7, 1))

function cheque(over: Partial<ChequeExtraido> = {}): ChequeExtraido {
  return {
    banco_codigo: '748',
    banco_nome: 'Sicredi',
    agencia: '0163',
    conta: '123456',
    numero_cheque: '123456',
    cmc7: { bloco1: BLOCO1_OK, bloco2: BLOCO2_OK, bloco3: BLOCO3_OK, digitos_duvidosos: [] },
    valor_numerico: 1842,
    valor_extenso_texto: 'hum mil oitocentos e quarenta e dois reais',
    data_emissao: '2026-08-15',
    bom_para_anotado: null,
    nominal: 'SECURITIZADORA XYZ LTDA',
    emitente: 'Daniel Souza',
    cidade_praca: 'Chapecó',
    assinatura_presente: true,
    rasuras_detectadas: [],
    confianca_por_campo: {},
    nao_lidos: [],
    observacoes: null,
    ...over,
  }
}

/** Um cheque para cada situação que o validador sabe detectar. */
const CASOS: ChequeExtraido[] = [
  cheque({ valor_extenso_texto: 'quatrocentos reais' }),
  cheque({ valor_extenso_texto: null }),
  cheque({ valor_extenso_texto: 'ilegivel rasurado' }),
  cheque({ valor_extenso_texto: 'mil xpto reais', valor_numerico: 1000 }),
  cheque({ valor_numerico: null }),
  cheque({ data_emissao: null }),
  cheque({ rasuras_detectadas: ['data rasurada'] }),
  cheque({ rasuras_detectadas: ['nominal com corretivo'] }),
  cheque({ rasuras_detectadas: ['valor por extenso emendado'] }),
  cheque({ rasuras_detectadas: ['borrão no canto'] }),
  cheque({ bom_para_anotado: '2026-08-12' }),
  cheque({ data_emissao: '2024-08-15' }),
  cheque({ data_emissao: '2028-08-15' }),
  cheque({ assinatura_presente: false }),
  cheque({ nominal: null }),
  cheque({ confianca_por_campo: { valor_numerico: 'baixa' } }),
  cheque({ banco_codigo: '001' }),
  cheque({ agencia: '9999' }),
  cheque({ numero_cheque: '999999' }),
  cheque({ conta: '987654' }),
  cheque({ cmc7: { bloco1: null, bloco2: BLOCO2_OK, bloco3: BLOCO3_OK, digitos_duvidosos: [] } }),
  cheque({
    cmc7: { bloco1: '7480163', bloco2: BLOCO2_OK, bloco3: BLOCO3_OK, digitos_duvidosos: [] },
  }),
  cheque({
    cmc7: { bloco1: '74801680', bloco2: BLOCO2_OK, bloco3: BLOCO3_OK, digitos_duvidosos: [] },
  }),
  cheque({
    cmc7: {
      bloco1: '74801680',
      bloco2: BLOCO2_OK,
      bloco3: BLOCO3_OK,
      digitos_duvidosos: [{ bloco: 1, posicao: 7, alternativas: ['8', '3'] }],
    },
  }),
  // Os casos que o `?` introduziu.
  cheque({ cmc7: { bloco1: '748016?0', bloco2: BLOCO2_OK, bloco3: BLOCO3_OK, digitos_duvidosos: [] } }),
  cheque({ valor_extenso_texto: 'quatrocentos e ? reais' }),
  cheque({ valor_numerico: null, nao_lidos: ['valor_numerico'] }),
  cheque({ data_emissao: null, nao_lidos: ['data_emissao'] }),
]

describe('cobertura das explicações', () => {
  it('todo alerta que o validador emite tem explicação em linguagem de gente', () => {
    const semExplicacao = new Set<string>()

    for (const caso of CASOS) {
      for (const alerta of validarCheque(caso, HOJE).alertas) {
        if (!explicarAlerta(alerta)) semExplicacao.add(alerta.codigo)
      }
    }

    // Falhar aqui significa: alguém criou um alerta novo e não escreveu o que
    // ele quer dizer. Sem isso a operadora recebe um aviso que precisa adivinhar.
    expect([...semExplicacao]).toEqual([])
  })

  it('o alerta extra de foto ruim também tem explicação', () => {
    expect(
      explicarAlerta({
        nivel: 'amarelo',
        codigo: 'foto_baixa_qualidade',
        titulo: 'Lido de foto com baixa qualidade',
        detalhe: '',
      }),
    ).not.toBeNull()
  })

  it('a explicação dos três grupos do CMC7 é a mesma', () => {
    const base = { nivel: 'amarelo' as const, titulo: 't', detalhe: 'd' }
    const um = explicarAlerta({ ...base, codigo: 'cmc7_bloco1_dv_invalido' })
    const tres = explicarAlerta({ ...base, codigo: 'cmc7_bloco3_dv_invalido' })
    expect(um?.porQue).toBe(tres?.porQue)
  })
})

describe('a explicação usa os números do cheque, não texto genérico', () => {
  it('divergência de valor mostra os dois lados e diz qual vale', () => {
    const alerta = validarCheque(
      cheque({ valor_extenso_texto: 'quatrocentos reais', valor_numerico: 1842 }),
      HOJE,
    ).alertas.find((a) => a.codigo === 'extenso_divergente')!

    const explicacao = explicarAlerta(alerta)!
    expect(explicacao.oQue).toContain('R$ 400,00')
    expect(explicacao.oQue).toContain('R$ 1.842,00')

    const porExtenso = explicacao.comparacao?.find((l) => l.rotulo.includes('extenso'))
    expect(porExtenso?.valor).toBe('R$ 400,00')
    // O lado que o banco paga é o destacado como "o que vale".
    expect(porExtenso?.tom).toBe('ok')
    expect(explicacao.comparacao?.find((l) => l.rotulo.includes('números'))?.tom).toBe('erro')
  })

  /**
   * A operadora leu "Lido 9, calculado 8" e disse "não entendi"; o Gabriel foi
   * atrás e concluiu "nunca aprendi sobre isso, por que a Amanda faria isso no
   * trabalho?". A explicação existe para dizer o que fazer, não para ensinar
   * como o CMC7 funciona por dentro.
   */
  it('a explicação do CMC7 não usa jargão nem ensina a conta', () => {
    const alerta = validarCheque(
      cheque({
        cmc7: { bloco1: '74801680', bloco2: BLOCO2_OK, bloco3: BLOCO3_OK, digitos_duvidosos: [] },
      }),
      HOJE,
    ).alertas.find((a) => a.codigo === 'cmc7_bloco1_dv_invalido')!

    const explicacao = explicarAlerta(alerta)!
    const tudo = [explicacao.oQue, explicacao.porQue, ...explicacao.oQueFazer]
      .join(' ')
      .toLowerCase()

    for (const jargao of ['bloco', 'dígito verificador', 'somatória', 'módulo', 'luhn']) {
      expect(tudo, jargao).not.toContain(jargao)
    }
    // O que ela precisa: olhar a foto e corrigir.
    expect(tudo).toContain('foto')
    expect(tudo).toContain('corrigir')
  })

  it('a explicação do que não foi lido é curta e diz o que fazer', () => {
    const explicacao = explicarAlerta({
      nivel: 'amarelo',
      codigo: 'campos_nao_lidos',
      titulo: 'Não conseguimos ler: valor em números',
      detalhe: '',
      dados: { campos: 'valor em números' },
    })!
    expect(explicacao.oQue).toContain('valor em números')
    // Curta de propósito: "apenas isso", como ela pediu.
    expect(explicacao.oQueFazer.length).toBeLessThanOrEqual(3)
    expect(explicacao.comparacao).toBeUndefined()
  })

  it('bom para anterior mostra as duas datas e qual o banco enxerga', () => {
    const alerta = validarCheque(
      cheque({ data_emissao: '2026-08-15', bom_para_anotado: '2026-08-12' }),
      HOJE,
    ).alertas.find((a) => a.codigo === 'bom_para_anterior_emissao')!

    const explicacao = explicarAlerta(alerta)!
    expect(explicacao.comparacao?.map((l) => l.valor)).toEqual(['12/08/2026', '15/08/2026'])
    expect(explicacao.comparacao?.[1].rotulo).toContain('banco vê')
  })
})
