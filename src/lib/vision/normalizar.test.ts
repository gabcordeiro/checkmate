import { describe, expect, it } from 'vitest'
import { normalizarChequeExtraido } from './index'
import { paraGemini, SCHEMA_EXTRACAO } from './schema'

/**
 * O modelo pode devolver campo faltando, tipo trocado ou formato de data
 * errado. Nada disso pode virar exceção em produção — a rota de extração
 * precisa sempre conseguir persistir algo que a validação saiba criticar.
 */
describe('normalizarChequeExtraido', () => {
  it('preenche a estrutura inteira a partir de um objeto vazio', () => {
    const cheque = normalizarChequeExtraido({})
    expect(cheque.cmc7).toEqual({
      bloco1: null,
      bloco2: null,
      bloco3: null,
      digitos_duvidosos: [],
    })
    expect(cheque.assinatura_presente).toBe(false)
    expect(cheque.rasuras_detectadas).toEqual([])
    expect(cheque.confianca_por_campo).toEqual({})
    expect(cheque.valor_numerico).toBeNull()
  })

  it('tolera null e undefined na raiz', () => {
    expect(normalizarChequeExtraido(null).emitente).toBeNull()
    expect(normalizarChequeExtraido(undefined).emitente).toBeNull()
  })

  it('limpa separadores dos campos numéricos do CMC7', () => {
    const cheque = normalizarChequeExtraido({
      cmc7: { bloco1: '748 0163 0', bloco2: '<0010 0123456 4>', bloco3: null },
    })
    expect(cheque.cmc7.bloco1).toBe('74801630')
    expect(cheque.cmc7.bloco2).toBe('001001234564')
    expect(cheque.cmc7.bloco3).toBeNull()
  })

  it('aceita valor numérico em formato pt-BR ou com R$', () => {
    expect(normalizarChequeExtraido({ valor_numerico: 'R$ 1.842,50' }).valor_numerico).toBe(1842.5)
    expect(normalizarChequeExtraido({ valor_numerico: '1842.50' }).valor_numerico).toBe(1842.5)
    expect(normalizarChequeExtraido({ valor_numerico: 1842.5 }).valor_numerico).toBe(1842.5)
    expect(normalizarChequeExtraido({ valor_numerico: 'ilegível' }).valor_numerico).toBeNull()
  })

  it('converte data DD/MM/AAAA para ISO, apesar do schema pedir ISO', () => {
    expect(normalizarChequeExtraido({ data_emissao: '15/08/2026' }).data_emissao).toBe('2026-08-15')
    expect(normalizarChequeExtraido({ data_emissao: '15/08/26' }).data_emissao).toBe('2026-08-15')
    expect(normalizarChequeExtraido({ data_emissao: '2026-8-5' }).data_emissao).toBe('2026-08-05')
    expect(normalizarChequeExtraido({ data_emissao: 'rasurada' }).data_emissao).toBeNull()
  })

  it('trata a string "null" como ausência', () => {
    expect(normalizarChequeExtraido({ nominal: 'null' }).nominal).toBeNull()
    expect(normalizarChequeExtraido({ nominal: '   ' }).nominal).toBeNull()
  })

  it('descarta dígito duvidoso malformado e mantém o válido', () => {
    const cheque = normalizarChequeExtraido({
      cmc7: {
        digitos_duvidosos: [
          { bloco: 1, posicao: 7, alternativas: ['3', '8'] },
          { bloco: 9, posicao: 1, alternativas: ['1'] }, // bloco inexistente
          { bloco: 2, posicao: 0, alternativas: ['1'] }, // posição inválida
          { bloco: 2, posicao: 3, alternativas: [] }, // sem alternativa
          { bloco: 3, posicao: 2, alternativas: ['ab', '5'] }, // limpa não-dígito
        ],
      },
    })
    expect(cheque.cmc7.digitos_duvidosos).toEqual([
      { bloco: 1, posicao: 7, alternativas: ['3', '8'] },
      { bloco: 3, posicao: 2, alternativas: ['5'] },
    ])
  })

  it('aceita confiança como lista (schema) ou como objeto (modelo teimoso)', () => {
    expect(
      normalizarChequeExtraido({
        confianca_por_campo: [
          { campo: 'valor_numerico', nivel: 'baixa' },
          { campo: 'cmc7', nivel: 'ALTA' },
          { campo: 'lixo', nivel: 'meia-boca' },
        ],
      }).confianca_por_campo,
    ).toEqual({ valor_numerico: 'baixa', cmc7: 'alta' })

    expect(
      normalizarChequeExtraido({ confianca_por_campo: { data_emissao: 'media' } })
        .confianca_por_campo,
    ).toEqual({ data_emissao: 'media' })
  })

  it('só marca assinatura presente com true explícito', () => {
    expect(normalizarChequeExtraido({ assinatura_presente: true }).assinatura_presente).toBe(true)
    expect(normalizarChequeExtraido({ assinatura_presente: 'sim' }).assinatura_presente).toBe(false)
    expect(normalizarChequeExtraido({}).assinatura_presente).toBe(false)
  })
})

describe('conversão do schema para o dialeto do Gemini', () => {
  it('usa tipos em caixa alta e marca nullable', () => {
    const convertido = paraGemini(SCHEMA_EXTRACAO)
    expect(convertido.type).toBe('OBJECT')

    const chequeItem = convertido.properties?.cheques.items
    expect(chequeItem?.type).toBe('OBJECT')
    expect(chequeItem?.properties?.banco_codigo).toEqual({
      type: 'STRING',
      nullable: true,
      description: 'Código de compensação, ex "748".',
    })
    expect(chequeItem?.properties?.assinatura_presente).toEqual({ type: 'BOOLEAN' })
    expect(chequeItem?.properties?.valor_numerico?.nullable).toBe(true)
    expect(chequeItem?.properties?.valor_numerico?.type).toBe('NUMBER')
  })

  it('não deixa additionalProperties passar (o Gemini rejeita)', () => {
    const serializado = JSON.stringify(paraGemini(SCHEMA_EXTRACAO))
    expect(serializado).not.toContain('additionalProperties')
  })

  it('preserva required e enum', () => {
    const convertido = paraGemini(SCHEMA_EXTRACAO)
    const chequeItem = convertido.properties?.cheques.items
    expect(chequeItem?.required).toContain('cmc7')
    expect(chequeItem?.properties?.confianca_por_campo?.items?.properties?.nivel?.enum).toEqual([
      'alta',
      'media',
      'baixa',
    ])
  })
})
