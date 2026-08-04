import { describe, expect, it } from 'vitest'
import { validarCheque } from './index'
import type { ChequeExtraido } from './types'

const BLOCO1_OK = '74801630'
const BLOCO2_OK = '001001234564'
const BLOCO3_OK = '0001234566'

/** Data fixa como "hoje" para as janelas de plausibilidade não quebrarem com o tempo. */
const HOJE = new Date(Date.UTC(2026, 7, 1)) // 2026-08-01

function cheque(over: Partial<ChequeExtraido> = {}): ChequeExtraido {
  return {
    banco_codigo: '748',
    banco_nome: 'Sicredi',
    agencia: '0163',
    conta: '123456',
    numero_cheque: '123456',
    cmc7: {
      bloco1: BLOCO1_OK,
      bloco2: BLOCO2_OK,
      bloco3: BLOCO3_OK,
      digitos_duvidosos: [],
    },
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

const codigos = (c: ChequeExtraido) => validarCheque(c, HOJE).alertas.map((a) => a.codigo)

describe('cheque limpo', () => {
  it('passa sem nenhum alerta', () => {
    const r = validarCheque(cheque(), HOJE)
    expect(r.alertas).toEqual([])
    expect(r.status).toBe('ok')
    expect(r.valor_extenso_convertido).toBe(1842)
    expect(r.data_efetiva).toBe('2026-08-15')
  })
})

describe('extenso × numérico (Lei do Cheque, art. 12)', () => {
  it('caso real: extenso "quatrocentos" contra numérico 1.842 é VERMELHO', () => {
    const r = validarCheque(
      cheque({ valor_extenso_texto: 'quatrocentos reais', valor_numerico: 1842 }),
      HOJE,
    )
    const alerta = r.alertas.find((a) => a.codigo === 'extenso_divergente')
    expect(r.status).toBe('vermelho')
    expect(alerta?.nivel).toBe('vermelho')
    expect(alerta?.detalhe).toContain('R$ 400,00')
    expect(alerta?.detalhe).toContain('R$ 1.842,00')
    expect(alerta?.detalhe).toContain('art. 12')
    expect(r.valor_extenso_convertido).toBe(400)
  })

  it('diferença de centavos também é divergência', () => {
    expect(
      codigos(
        cheque({
          valor_extenso_texto: 'mil oitocentos e quarenta e dois reais e cinquenta centavos',
          valor_numerico: 1842,
        }),
      ),
    ).toContain('extenso_divergente')
  })

  it('não alerta quando extenso e numérico batem com centavos', () => {
    const r = validarCheque(
      cheque({
        valor_extenso_texto: 'mil oitocentos e quarenta e dois reais e cinquenta centavos',
        valor_numerico: 1842.5,
      }),
      HOJE,
    )
    expect(r.alertas).toEqual([])
  })

  it('extenso ilegível é amarelo, nunca vermelho', () => {
    const r = validarCheque(cheque({ valor_extenso_texto: 'ilegivel rasurado' }), HOJE)
    expect(r.status).toBe('conferir')
    expect(codigos(cheque({ valor_extenso_texto: 'ilegivel rasurado' }))).toContain(
      'valor_extenso_ilegivel',
    )
  })

  it('valor numérico não lido não gera divergência falsa', () => {
    const lista = codigos(cheque({ valor_numerico: null, nao_lidos: ['valor_numerico'] }))
    expect(lista).toContain('campos_nao_lidos')
    expect(lista).not.toContain('extenso_divergente')
  })

  /**
   * O caso que a operadora apontou: o extenso é manuscrito e nem sempre sai
   * inteiro. Comparar meia frase com o número produziria um vermelho
   * "o banco vai devolver" por erro de leitura NOSSO.
   */
  it('extenso lido pela metade NÃO vira alerta vermelho', () => {
    const r = validarCheque(
      cheque({ valor_extenso_texto: 'quatrocentos e ? reais', valor_numerico: 1842 }),
      HOJE,
    )
    expect(r.status).toBe('conferir')
    expect(r.alertas.map((a) => a.codigo)).toContain('valor_extenso_parcial')
    expect(r.alertas.map((a) => a.codigo)).not.toContain('extenso_divergente')
    // Sem valor comparável, nada é gravado como se fosse o valor do cheque.
    expect(r.valor_extenso_convertido).toBeNull()
  })

  it('cheque realmente sem extenso continua sendo apontado', () => {
    expect(codigos(cheque({ valor_extenso_texto: null }))).toContain('valor_extenso_ausente')
  })
})

describe('datas', () => {
  it('caso real: bom para 12/08 com cheque datado 15/08 é VERMELHO', () => {
    const r = validarCheque(
      cheque({ data_emissao: '2026-08-15', bom_para_anotado: '2026-08-12' }),
      HOJE,
    )
    const alerta = r.alertas.find((a) => a.codigo === 'bom_para_anterior_emissao')
    expect(r.status).toBe('vermelho')
    expect(alerta?.nivel).toBe('vermelho')
    expect(alerta?.detalhe).toContain('12/08/2026')
    expect(alerta?.detalhe).toContain('15/08/2026')
    // Ordenação cai na data escrita no cheque, que é a que o banco usa.
    expect(r.data_efetiva).toBe('2026-08-15')
  })

  it('bom para posterior à emissão manda na data efetiva', () => {
    const r = validarCheque(
      cheque({ data_emissao: '2026-08-15', bom_para_anotado: '2026-09-30' }),
      HOJE,
    )
    expect(r.alertas).toEqual([])
    expect(r.data_efetiva).toBe('2026-09-30')
  })

  it('cheque SEM data é VERMELHO (o banco devolve)', () => {
    const r = validarCheque(cheque({ data_emissao: null }), HOJE)
    expect(r.status).toBe('vermelho')
    expect(r.alertas.map((a) => a.codigo)).toContain('data_emissao_ausente')
  })

  /**
   * Distinção que o `?` tornou possível: "não consegui ler" é problema nosso,
   * ela digita e resolve. Antes isso dava o mesmo vermelho de "cheque sem
   * data" e assustava por uma falha de leitura.
   */
  it('data que a IA não conseguiu ler é AMARELO, não vermelho', () => {
    const r = validarCheque(
      cheque({ data_emissao: null, nao_lidos: ['data_emissao'] }),
      HOJE,
    )
    expect(r.status).toBe('conferir')
    const lista = r.alertas.map((a) => a.codigo)
    expect(lista).toContain('campos_nao_lidos')
    expect(lista).not.toContain('data_emissao_ausente')
  })

  it('data inexistente (31/02) conta como cheque sem data', () => {
    expect(codigos(cheque({ data_emissao: '2026-02-31' }))).toContain('data_emissao_ausente')
  })

  it('data rasurada é VERMELHO mesmo com a data legível', () => {
    const r = validarCheque(cheque({ rasuras_detectadas: ['data rasurada'] }), HOJE)
    expect(r.status).toBe('vermelho')
    expect(r.alertas.map((a) => a.codigo)).toContain('data_rasurada')
    // Não duplica como rasura genérica.
    expect(r.alertas.filter((a) => a.codigo === 'rasura_outro_campo')).toHaveLength(0)
  })

  it('ano fora da janela de 12 meses é amarelo (leitura suspeita)', () => {
    expect(codigos(cheque({ data_emissao: '2024-08-15' }))).toContain(
      'data_emissao_passado_distante',
    )
    expect(codigos(cheque({ data_emissao: '2028-08-15' }))).toContain(
      'data_emissao_futuro_distante',
    )
  })

  it('cheque pré-datado normal (3 meses à frente) não alerta', () => {
    const r = validarCheque(
      cheque({ data_emissao: '2026-08-01', bom_para_anotado: '2026-11-01' }),
      HOJE,
    )
    expect(r.alertas).toEqual([])
  })
})

describe('checklist visual', () => {
  it('sem assinatura é VERMELHO', () => {
    const r = validarCheque(cheque({ assinatura_presente: false }), HOJE)
    expect(r.status).toBe('vermelho')
    expect(r.alertas.map((a) => a.codigo)).toContain('sem_assinatura')
  })

  it('rasura no nominal e no valor é VERMELHO', () => {
    expect(codigos(cheque({ rasuras_detectadas: ['nominal com corretivo'] }))).toContain(
      'rasura_nominal',
    )
    expect(codigos(cheque({ rasuras_detectadas: ['valor por extenso rasurado'] }))).toContain(
      'rasura_valor',
    )
  })

  it('rasura em campo não crítico é amarelo', () => {
    const r = validarCheque(cheque({ rasuras_detectadas: ['borrão no canto do cheque'] }), HOJE)
    expect(r.status).toBe('conferir')
    expect(r.alertas.map((a) => a.codigo)).toContain('rasura_outro_campo')
  })

  it('nominal vazio é amarelo', () => {
    const r = validarCheque(cheque({ nominal: null }), HOJE)
    expect(r.status).toBe('conferir')
    expect(r.alertas.map((a) => a.codigo)).toContain('nominal_vazio')
  })

  it('campo de baixa confiança vira amarelo', () => {
    expect(codigos(cheque({ confianca_por_campo: { valor_numerico: 'baixa' } }))).toContain(
      'confianca_baixa',
    )
  })
})

describe('CMC7', () => {
  it('DV que não fecha, com duvidoso resolvido, sugere o dígito certo', () => {
    const r = validarCheque(
      cheque({
        cmc7: {
          bloco1: '74801680',
          bloco2: BLOCO2_OK,
          bloco3: BLOCO3_OK,
          digitos_duvidosos: [{ bloco: 1, posicao: 7, alternativas: ['8', '3'] }],
        },
      }),
      HOJE,
    )
    // Resolvido sozinho não vira alerta: não há nada para ela fazer. O dígito
    // certo aparece destacado no CMC7 e o contador diz "1 número corrigido".
    expect(r.alertas).toEqual([])
    expect(r.status).toBe('ok')
    expect(r.cmc7_sugestoes).toEqual([
      {
        bloco: 1,
        posicao: 7,
        digito: '3',
        descartados: ['8'],
        bloco_corrigido: BLOCO1_OK,
      },
    ])
  })

  it('DV que não fecha e nenhuma alternativa resolve manda refotografar', () => {
    const r = validarCheque(
      cheque({
        cmc7: {
          bloco1: '74801680',
          bloco2: BLOCO2_OK,
          bloco3: BLOCO3_OK,
          digitos_duvidosos: [{ bloco: 1, posicao: 7, alternativas: ['8', '9'] }],
        },
      }),
      HOJE,
    )
    const alerta = r.alertas.find((a) => a.codigo === 'cmc7_bloco1_dv_invalido')
    expect(alerta?.nivel).toBe('amarelo')
    expect(alerta?.titulo).toBe('Confira o CMC7 na foto')
    // Nada de "bloco", "dígito verificador" ou somatória: a operadora não usa
    // esses conceitos no trabalho e travou neles no teste.
    const texto = `${alerta?.titulo} ${alerta?.detalhe}`.toLowerCase()
    for (const jargao of ['bloco', 'verificador', 'somatória', 'módulo']) {
      expect(texto).not.toContain(jargao)
    }
    expect(r.cmc7_sugestoes).toEqual([])
  })

  it('bloco com ? não gera alerta de CMC7 — o ? na tela já diz', () => {
    const r = validarCheque(
      cheque({
        cmc7: {
          bloco1: '748016?0',
          bloco2: BLOCO2_OK,
          bloco3: BLOCO3_OK,
          digitos_duvidosos: [],
        },
      }),
      HOJE,
    )
    const lista = r.alertas.map((a) => a.codigo)
    expect(lista.filter((c) => c.startsWith('cmc7_bloco'))).toEqual([])
    // Aparece só no aviso único de campos não lidos, para o cheque não sumir
    // do painel do lote.
    expect(lista).toContain('campos_nao_lidos')
  })

  /** Regressão do falso positivo: bloco com tamanho errado dava DOIS alertas. */
  it('bloco com tamanho errado gera UM alerta, não dois', () => {
    const r = validarCheque(
      cheque({
        cmc7: {
          bloco1: '021017369',
          bloco2: BLOCO2_OK,
          bloco3: BLOCO3_OK,
          digitos_duvidosos: [],
        },
        banco_codigo: null,
        agencia: null,
      }),
      HOJE,
    )
    const doCmc7 = r.alertas.map((a) => a.codigo).filter((c) => c.startsWith('cmc7_bloco'))
    expect(doCmc7).toEqual(['cmc7_bloco1_tamanho'])
  })

  it('bloco ausente é amarelo', () => {
    expect(
      codigos(
        cheque({
          cmc7: { bloco1: BLOCO1_OK, bloco2: null, bloco3: BLOCO3_OK, digitos_duvidosos: [] },
        }),
      ),
    ).toContain('cmc7_bloco2_ausente')
  })

  it('bloco com tamanho errado é amarelo', () => {
    expect(
      codigos(
        cheque({
          cmc7: { bloco1: '7480163', bloco2: BLOCO2_OK, bloco3: BLOCO3_OK, digitos_duvidosos: [] },
        }),
      ),
    ).toContain('cmc7_bloco1_tamanho')
  })

  it('banco impresso divergente do CMC7 é amarelo', () => {
    expect(codigos(cheque({ banco_codigo: '001' }))).toContain('cruzamento_banco')
  })

  it('agência impressa divergente do CMC7 é amarelo', () => {
    expect(codigos(cheque({ agencia: '9999' }))).toContain('cruzamento_agencia')
  })

  it('número do cheque que não aparece no bloco 2 é amarelo', () => {
    expect(codigos(cheque({ numero_cheque: '999999' }))).toContain('cruzamento_numero_cheque')
  })

  it('conta que não aparece no bloco 3 é amarelo', () => {
    expect(codigos(cheque({ conta: '987654' }))).toContain('cruzamento_conta')
  })

  it('agência sem zero à esquerda no cabeçalho não gera falso alerta', () => {
    expect(codigos(cheque({ agencia: '163', banco_codigo: '748' }))).not.toContain(
      'cruzamento_agencia',
    )
  })
})

describe('ordenação e status', () => {
  it('vermelhos vêm antes dos amarelos', () => {
    const r = validarCheque(
      cheque({
        assinatura_presente: false,
        nominal: null,
        valor_extenso_texto: 'quatrocentos reais',
      }),
      HOJE,
    )
    const niveis = r.alertas.map((a) => a.nivel)
    expect(niveis.indexOf('amarelo')).toBeGreaterThan(niveis.lastIndexOf('vermelho'))
    expect(r.status).toBe('vermelho')
  })
})
