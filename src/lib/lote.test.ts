import { describe, expect, it } from 'vitest'
import { loteParaCsv } from './csv'
import { agruparPorEmitente, alertasDoLote, resumirLote } from './lote'
import { normalizarEmitente } from './format'
import type { ChequeRow } from './supabase/types'

function linha(over: Partial<ChequeRow> = {}): ChequeRow {
  const emitente = over.emitente ?? 'Daniel Souza'
  return {
    id: over.id ?? Math.random().toString(16).slice(2),
    batch_id: 'lote-1',
    owner_id: 'dono-1',
    org_id: null,
    storage_path: 'dono-1/lote-1/foto.jpg',
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
    nao_lidos: [],
    observacoes: null,
    status: 'ok',
    alertas: [],
    lancado: false,
    revisado_manualmente: false,
    created_at: '2026-07-29T12:00:00Z',
    ...over,
  }
}

describe('agruparPorEmitente', () => {
  it('junta grafias diferentes do mesmo emitente', () => {
    const grupos = agruparPorEmitente([
      linha({ emitente: 'Daniel Souza' }),
      linha({ emitente: 'DANIEL SOUZA' }),
      linha({ emitente: 'daniel  souza' }),
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].cheques).toHaveLength(3)
  })

  it('ordena os cheques do emitente pela data efetiva', () => {
    const grupos = agruparPorEmitente([
      linha({ data_efetiva: '2026-10-01', numero_cheque: '3' }),
      linha({ data_efetiva: '2026-08-01', numero_cheque: '1' }),
      linha({ data_efetiva: '2026-09-01', numero_cheque: '2' }),
    ])
    expect(grupos[0].cheques.map((c) => c.numero_cheque)).toEqual(['1', '2', '3'])
  })

  it('joga cheque sem data para o fim, em vez de para o começo', () => {
    const grupos = agruparPorEmitente([
      linha({ data_efetiva: null, data_emissao: null, bom_para: null, numero_cheque: 'sem-data' }),
      linha({ data_efetiva: '2026-09-01', numero_cheque: 'com-data' }),
    ])
    expect(grupos[0].cheques.map((c) => c.numero_cheque)).toEqual(['com-data', 'sem-data'])
  })

  it('soma o subtotal por emitente', () => {
    const grupos = agruparPorEmitente([
      linha({ emitente: 'A', valor_numerico: 1000.5 }),
      linha({ emitente: 'A', valor_numerico: 842.3 }),
      linha({ emitente: 'B', valor_numerico: 100 }),
    ])
    const a = grupos.find((g) => g.chave === 'A')
    expect(a?.subtotal).toBe(1842.8)
    expect(grupos.find((g) => g.chave === 'B')?.subtotal).toBe(100)
  })

  it('emitente com vermelho aparece primeiro', () => {
    const grupos = agruparPorEmitente([
      linha({ emitente: 'Zeca', status: 'ok' }),
      linha({
        emitente: 'Ana',
        status: 'vermelho',
        alertas: [
          { nivel: 'vermelho', codigo: 'sem_assinatura', titulo: 'Sem assinatura', detalhe: '' },
        ],
      }),
    ])
    expect(grupos[0].chave).toBe('ANA')
    expect(grupos[0].vermelhos).toBe(1)
  })

  it('agrupa cheque sem emitente sob um rótulo explícito', () => {
    const grupos = agruparPorEmitente([linha({ emitente: null, emitente_normalizado: null })])
    expect(grupos[0].chave).toBe('EMITENTE NÃO IDENTIFICADO')
  })
})

describe('resumirLote', () => {
  it('conta alertas, não cheques', () => {
    const resumo = resumirLote([
      linha({
        status: 'vermelho',
        alertas: [
          { nivel: 'vermelho', codigo: 'a', titulo: 'A', detalhe: '' },
          { nivel: 'vermelho', codigo: 'b', titulo: 'B', detalhe: '' },
          { nivel: 'amarelo', codigo: 'c', titulo: 'C', detalhe: '' },
        ],
      }),
      linha({ status: 'ok', lancado: true }),
    ])
    expect(resumo).toEqual({ quantidade: 2, total: 2000, vermelhos: 2, amarelos: 1, lancados: 1 })
  })
})

describe('alertasDoLote', () => {
  it('devolve vermelhos antes de amarelos', () => {
    const lista = alertasDoLote([
      linha({ alertas: [{ nivel: 'amarelo', codigo: 'a', titulo: 'A', detalhe: '' }] }),
      linha({ alertas: [{ nivel: 'vermelho', codigo: 'b', titulo: 'B', detalhe: '' }] }),
    ])
    expect(lista.map((i) => i.alerta.nivel)).toEqual(['vermelho', 'amarelo'])
  })
})

describe('loteParaCsv', () => {
  it('usa ponto e vírgula e vírgula decimal', () => {
    const csv = loteParaCsv([linha({ valor_numerico: 1842.5 })])
    const [cabecalho, primeira] = csv.split('\r\n')
    expect(cabecalho.startsWith('﻿emitente;banco;agencia')).toBe(true)
    expect(primeira).toContain(';1842,50;')
    expect(primeira).toContain('748016300010012345640001234566')
  })

  it('escapa campo com ponto e vírgula ou aspas', () => {
    const csv = loteParaCsv([
      linha({
        emitente: 'Souza; Filho "SA"',
        alertas: [
          { nivel: 'vermelho', codigo: 'x', titulo: 'Extenso divergente', detalhe: 'qualquer' },
        ],
      }),
    ])
    // O CSV mostra o nome como está no cheque (o normalizado é só a chave de
    // agrupamento), com ponto e vírgula preservado e aspas dobradas.
    expect(csv).toContain('"Souza; Filho ""SA"""')
    expect(csv).toContain('[VERMELHO] Extenso divergente')
  })

  it('deixa a célula vazia quando o valor não foi lido', () => {
    const csv = loteParaCsv([linha({ valor_numerico: null, bom_para: null })])
    const primeira = csv.split('\r\n')[1]
    expect(primeira.split(';')[7]).toBe('')
  })
})
