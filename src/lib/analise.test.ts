import { describe, expect, it } from 'vitest'
import { analisarLote, rotuloDoMes } from './analise'
import { normalizarEmitente } from './format'
import type { ChequeRow } from './supabase/types'
import type { Alerta } from './validation/types'

function linha(over: Partial<ChequeRow> = {}): ChequeRow {
  const emitente = over.emitente ?? 'Daniel Souza'
  return {
    id: over.id ?? Math.random().toString(16).slice(2),
    batch_id: 'lote-1',
    owner_id: 'dono-1',
    org_id: null,
    storage_path: null,
    emitente,
    emitente_normalizado: normalizarEmitente(emitente),
    banco_codigo: '748',
    banco_nome: 'Sicredi',
    agencia: '0163',
    conta: '123456',
    numero_cheque: '000101',
    cmc7_bloco1: '74801630',
    cmc7_bloco2: '001001234564',
    cmc7_bloco3: '0001234566',
    cmc7_completo: '748016300010012345640001234566',
    digitos_duvidosos: [],
    cmc7_sugestoes: [],
    valor_numerico: 1000,
    valor_extenso_texto: 'mil reais',
    valor_extenso_convertido: 1000,
    data_emissao: '2026-08-15',
    bom_para: null,
    data_efetiva: '2026-08-15',
    nominal: 'SECURITIZADORA XYZ',
    cidade: 'Chapecó',
    assinatura_presente: true,
    rasuras: [],
    confianca: {},
    observacoes: null,
    status: 'ok',
    alertas: [],
    lancado: false,
    revisado_manualmente: false,
    created_at: '2026-07-29T12:00:00Z',
    ...over,
  }
}

const vermelho = (codigo: string, titulo = 'Problema'): Alerta => ({
  nivel: 'vermelho',
  codigo,
  titulo,
  detalhe: 'detalhe do alerta',
})

const amarelo = (codigo: string, titulo = 'Conferir'): Alerta => ({
  nivel: 'amarelo',
  codigo,
  titulo,
  detalhe: 'detalhe do alerta',
})

describe('rotuloDoMes', () => {
  it('abrevia mês e ano', () => {
    expect(rotuloDoMes('2026-08')).toBe('ago/26')
    expect(rotuloDoMes('2026-01')).toBe('jan/26')
    expect(rotuloDoMes('2026-12')).toBe('dez/26')
  })

  it('devolve a entrada quando o mês não faz sentido', () => {
    expect(rotuloDoMes('2026-99')).toBe('2026-99')
  })
})

describe('analisarLote — dinheiro em risco', () => {
  it('separa o valor por situação', () => {
    const analise = analisarLote([
      linha({ status: 'vermelho', valor_numerico: 1842, alertas: [vermelho('extenso')] }),
      linha({ status: 'conferir', valor_numerico: 500, alertas: [amarelo('cmc7')] }),
      linha({ status: 'ok', valor_numerico: 100 }),
    ])
    expect(analise.emRisco).toEqual({ valor: 1842, cheques: 1 })
    expect(analise.aConferir).toEqual({ valor: 500, cheques: 1 })
    expect(analise.liberados).toEqual({ valor: 100, cheques: 1 })
    expect(analise.resumo.total).toBe(2442)
  })

  it('cheque sem valor lido não quebra as somas', () => {
    const analise = analisarLote([linha({ valor_numerico: null, status: 'conferir' })])
    expect(analise.aConferir).toEqual({ valor: 0, cheques: 1 })
    expect(analise.resumo.total).toBe(0)
  })

  it('conta emitentes distintos pela chave normalizada', () => {
    const analise = analisarLote([
      linha({ emitente: 'Daniel Souza' }),
      linha({ emitente: 'DANIEL  SOUZA' }),
      linha({ emitente: 'Márcia Lima' }),
    ])
    expect(analise.emitentes).toBe(2)
  })
})

describe('analisarLote — cronograma', () => {
  it('agrupa por mês da data efetiva e destaca a parte em risco', () => {
    const analise = analisarLote([
      linha({ data_efetiva: '2026-08-05', valor_numerico: 1000 }),
      linha({ data_efetiva: '2026-08-28', valor_numerico: 500 }),
      linha({
        data_efetiva: '2026-09-10',
        valor_numerico: 2000,
        status: 'vermelho',
        alertas: [vermelho('sem_assinatura')],
      }),
    ])
    expect(analise.cronograma).toEqual([
      { mes: '2026-08', rotulo: 'ago/26', total: 1500, risco: 0, quantidade: 2 },
      { mes: '2026-09', rotulo: 'set/26', total: 2000, risco: 2000, quantidade: 1 },
    ])
  })

  it('preenche o mês sem cheque para o cronograma não comprimir o tempo', () => {
    const analise = analisarLote([
      linha({ data_efetiva: '2026-08-05' }),
      linha({ data_efetiva: '2026-11-05' }),
    ])
    expect(analise.cronograma.map((m) => m.mes)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ])
    expect(analise.cronograma[1]).toEqual({
      mes: '2026-09',
      rotulo: 'set/26',
      total: 0,
      risco: 0,
      quantidade: 0,
    })
  })

  it('não preenche quando o intervalo passa de 24 meses (ano provavelmente mal lido)', () => {
    const analise = analisarLote([
      linha({ data_efetiva: '2026-08-05' }),
      linha({ data_efetiva: '2126-08-05' }),
    ])
    expect(analise.cronograma).toHaveLength(2)
  })

  it('usa bom_para quando não há data_efetiva', () => {
    const analise = analisarLote([
      linha({ data_efetiva: null, bom_para: '2026-10-01', data_emissao: '2026-08-01' }),
    ])
    expect(analise.cronograma[0].mes).toBe('2026-10')
  })

  it('cheque sem data nenhuma vai para semData, fora do cronograma', () => {
    const analise = analisarLote([
      linha({ data_efetiva: null, bom_para: null, data_emissao: null, valor_numerico: 700 }),
      linha({ data_efetiva: '2026-08-05', valor_numerico: 300 }),
    ])
    expect(analise.semData).toEqual({ valor: 700, cheques: 1 })
    expect(analise.cronograma).toHaveLength(1)
    expect(analise.cronograma[0].total).toBe(300)
  })

  it('aponta o primeiro e o último mês com cheque', () => {
    const analise = analisarLote([
      linha({ data_efetiva: '2026-09-05' }),
      linha({ data_efetiva: '2026-08-05' }),
    ])
    expect(analise.primeiroVencimento).toBe('2026-08')
    expect(analise.ultimoVencimento).toBe('2026-09')
  })

  it('lote vazio devolve estrutura utilizável', () => {
    const analise = analisarLote([])
    expect(analise.cronograma).toEqual([])
    expect(analise.primeiroVencimento).toBeNull()
    expect(analise.alertasPorTipo).toEqual([])
    expect(analise.resumo.quantidade).toBe(0)
  })
})

describe('analisarLote — alertas agrupados por tipo', () => {
  it('conta repetições e soma o valor afetado', () => {
    const analise = analisarLote([
      linha({
        id: 'a',
        valor_numerico: 1000,
        status: 'vermelho',
        alertas: [vermelho('extenso_divergente', 'Extenso divergente')],
      }),
      linha({
        id: 'b',
        valor_numerico: 500,
        status: 'vermelho',
        alertas: [vermelho('extenso_divergente', 'Extenso divergente')],
      }),
      linha({ id: 'c', valor_numerico: 200, status: 'conferir', alertas: [amarelo('nominal_vazio')] }),
    ])

    const extenso = analise.alertasPorTipo[0]
    expect(extenso.codigo).toBe('extenso_divergente')
    expect(extenso.quantidade).toBe(2)
    expect(extenso.valorAfetado).toBe(1500)
    expect(extenso.chequeIds).toEqual(['a', 'b'])
  })

  it('coloca vermelhos antes de amarelos, mesmo se o amarelo repetir mais', () => {
    const analise = analisarLote([
      linha({ alertas: [amarelo('x')] }),
      linha({ alertas: [amarelo('x')] }),
      linha({ alertas: [amarelo('x')] }),
      linha({ alertas: [vermelho('y')] }),
    ])
    expect(analise.alertasPorTipo.map((a) => a.codigo)).toEqual(['y', 'x'])
  })

  it('não duplica o cheque quando ele tem dois alertas do mesmo tipo', () => {
    const analise = analisarLote([
      linha({ id: 'unico', alertas: [amarelo('rasura_outro_campo'), amarelo('rasura_outro_campo')] }),
    ])
    expect(analise.alertasPorTipo[0].quantidade).toBe(2)
    expect(analise.alertasPorTipo[0].chequeIds).toEqual(['unico'])
  })
})
