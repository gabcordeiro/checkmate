import { describe, expect, it } from 'vitest'
import { aplicarEdicao, colunasDoCheque, linhaParaExtraido } from './cheque'
import type { ChequeRow } from './supabase/types'

const BLOCO1_OK = '74801630'
const BLOCO2_OK = '001001234564'
const BLOCO3_OK = '0001234566'

function linha(over: Partial<ChequeRow> = {}): ChequeRow {
  return {
    id: 'cheque-1',
    batch_id: 'lote-1',
    owner_id: 'dono-1',
    org_id: null,
    storage_path: null,
    emitente: 'Daniel Souza',
    emitente_normalizado: 'DANIEL SOUZA',
    banco_codigo: '748',
    banco_nome: 'Sicredi',
    agencia: '0163',
    conta: '123456',
    numero_cheque: '123456',
    cmc7_bloco1: BLOCO1_OK,
    cmc7_bloco2: BLOCO2_OK,
    cmc7_bloco3: BLOCO3_OK,
    cmc7_completo: `${BLOCO1_OK}${BLOCO2_OK}${BLOCO3_OK}`,
    digitos_duvidosos: [],
    cmc7_sugestoes: [],
    valor_numerico: 1842,
    valor_extenso_texto: 'hum mil oitocentos e quarenta e dois reais',
    valor_extenso_convertido: 1842,
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

describe('linhaParaExtraido', () => {
  it('reconstrói o extraído a partir da linha persistida', () => {
    const extraido = linhaParaExtraido(linha())
    expect(extraido.cmc7.bloco1).toBe(BLOCO1_OK)
    expect(extraido.bom_para_anotado).toBeNull()
    expect(extraido.cidade_praca).toBe('Chapecó')
    expect(extraido.assinatura_presente).toBe(true)
  })

  it('trata valor numérico vindo como string do Postgres', () => {
    const extraido = linhaParaExtraido(linha({ valor_numerico: '1842.00' as unknown as number }))
    expect(extraido.valor_numerico).toBe(1842)
  })
})

describe('aplicarEdicao', () => {
  it('só troca o que foi informado', () => {
    const base = linhaParaExtraido(linha())
    const editado = aplicarEdicao(base, { valor_numerico: 400 })
    expect(editado.valor_numerico).toBe(400)
    expect(editado.valor_extenso_texto).toBe(base.valor_extenso_texto)
    expect(editado.cmc7.bloco1).toBe(BLOCO1_OK)
  })

  it('aceita limpar um campo com null', () => {
    const editado = aplicarEdicao(linhaParaExtraido(linha()), { nominal: null })
    expect(editado.nominal).toBeNull()
  })

  it('descarta os dígitos duvidosos do bloco que a operadora corrigiu', () => {
    const base = linhaParaExtraido(
      linha({
        cmc7_bloco1: '74801680',
        digitos_duvidosos: [
          { bloco: 1, posicao: 7, alternativas: ['8', '3'] },
          { bloco: 2, posicao: 4, alternativas: ['1', '7'] },
        ],
      }),
    )
    const editado = aplicarEdicao(base, { cmc7_bloco1: BLOCO1_OK })
    expect(editado.cmc7.bloco1).toBe(BLOCO1_OK)
    // A dúvida do bloco 1 morreu (ela leu na foto); a do bloco 2 continua.
    expect(editado.cmc7.digitos_duvidosos).toEqual([
      { bloco: 2, posicao: 4, alternativas: ['1', '7'] },
    ])
  })
})

describe('revalidação depois da correção manual', () => {
  it('corrigir o extenso apaga o alerta vermelho de divergência', () => {
    const original = linha({
      valor_extenso_texto: 'quatrocentos reais',
      valor_numerico: 1842,
    })
    const antes = colunasDoCheque(linhaParaExtraido(original))
    expect(antes.status).toBe('vermelho')
    expect(antes.alertas.map((a) => a.codigo)).toContain('extenso_divergente')

    const depois = colunasDoCheque(
      aplicarEdicao(linhaParaExtraido(original), {
        valor_extenso_texto: 'hum mil oitocentos e quarenta e dois reais',
      }),
    )
    expect(depois.status).toBe('ok')
    expect(depois.alertas).toEqual([])
    expect(depois.valor_extenso_convertido).toBe(1842)
  })

  it('corrigir o valor numérico para o do extenso também resolve', () => {
    const depois = colunasDoCheque(
      aplicarEdicao(
        linhaParaExtraido(linha({ valor_extenso_texto: 'quatrocentos reais', valor_numerico: 1842 })),
        { valor_numerico: 400 },
      ),
    )
    expect(depois.status).toBe('ok')
    expect(depois.valor_numerico).toBe(400)
  })

  it('corrigir o CMC7 recalcula o DV e limpa a sugestão', () => {
    const original = linha({
      cmc7_bloco1: '74801680',
      digitos_duvidosos: [{ bloco: 1, posicao: 7, alternativas: ['8', '3'] }],
    })
    const antes = colunasDoCheque(linhaParaExtraido(original))
    expect(antes.cmc7_sugestoes).toHaveLength(1)

    const depois = colunasDoCheque(
      aplicarEdicao(linhaParaExtraido(original), { cmc7_bloco1: BLOCO1_OK }),
    )
    expect(depois.status).toBe('ok')
    expect(depois.cmc7_sugestoes).toEqual([])
    expect(depois.cmc7_completo).toBe(`${BLOCO1_OK}${BLOCO2_OK}${BLOCO3_OK}`)
  })

  it('CMC7 corrigido para um DV que não fecha volta a alertar', () => {
    const depois = colunasDoCheque(
      aplicarEdicao(linhaParaExtraido(linha()), { cmc7_bloco1: '74801637' }),
    )
    expect(depois.alertas.map((a) => a.codigo)).toContain('cmc7_bloco1_dv_invalido')
  })

  it('corrigir a data recalcula a data efetiva e o alerta de bom-para', () => {
    const original = linha({ data_emissao: '2026-08-15', bom_para: '2026-08-12' })
    const antes = colunasDoCheque(linhaParaExtraido(original))
    expect(antes.alertas.map((a) => a.codigo)).toContain('bom_para_anterior_emissao')
    expect(antes.data_efetiva).toBe('2026-08-15')

    const depois = colunasDoCheque(
      aplicarEdicao(linhaParaExtraido(original), { bom_para: '2026-09-12' }),
    )
    expect(depois.alertas).toEqual([])
    expect(depois.data_efetiva).toBe('2026-09-12')
  })

  it('marcar assinatura como presente derruba o vermelho', () => {
    const depois = colunasDoCheque(
      aplicarEdicao(linhaParaExtraido(linha({ assinatura_presente: false })), {
        assinatura_presente: true,
      }),
    )
    expect(depois.status).toBe('ok')
  })

  it('alerta extra da foto ruim entra na lista e muda o status de ok para conferir', () => {
    const alertaFoto = {
      nivel: 'amarelo' as const,
      codigo: 'foto_baixa_qualidade',
      titulo: 'Lido de foto com baixa qualidade',
      detalhe: 'Foto 620px no lado menor.',
    }
    const semAlerta = colunasDoCheque(linhaParaExtraido(linha()))
    expect(semAlerta.status).toBe('ok')

    const comFoto = colunasDoCheque(linhaParaExtraido(linha()), [alertaFoto])
    expect(comFoto.status).toBe('conferir')
    expect(comFoto.alertas.map((a) => a.codigo)).toEqual(['foto_baixa_qualidade'])
  })

  it('alerta extra não rebaixa um cheque que já está vermelho', () => {
    const comAmbos = colunasDoCheque(linhaParaExtraido(linha({ assinatura_presente: false })), [
      {
        nivel: 'amarelo',
        codigo: 'foto_baixa_qualidade',
        titulo: 'Lido de foto com baixa qualidade',
        detalhe: '',
      },
    ])
    expect(comAmbos.status).toBe('vermelho')
    // Vermelho primeiro, mesmo com o alerta extra sendo adicionado depois.
    expect(comAmbos.alertas[0].nivel).toBe('vermelho')
    expect(comAmbos.alertas.map((a) => a.codigo)).toContain('foto_baixa_qualidade')
  })

  it('o ? fica guardado no CMC7 completo, não some na gravação', () => {
    const guardado = colunasDoCheque(linhaParaExtraido(linha({ cmc7_bloco1: '7480?630' })))
    // A tela decide pelo `?` se libera o botão de copiar. Se ele sumisse aqui,
    // o botão liberaria um número mais curto que o do cheque.
    expect(guardado.cmc7_completo).toContain('?')
    expect(guardado.cmc7_bloco1).toBe('7480?630')
    // Bloco com lacuna não é acusado de erro — o `?` na tela já diz o que houve.
    expect(guardado.alertas.map((a) => a.codigo)).not.toContain('cmc7_bloco1_dv_invalido')
  })

  it('digitar o número que faltava tira o ? e o campo de nao_lidos', () => {
    const original = linha({
      cmc7_bloco1: '7480?630',
      numero_cheque: null,
      nao_lidos: ['numero_cheque'],
    })
    const antes = colunasDoCheque(linhaParaExtraido(original))
    expect(antes.alertas.map((a) => a.codigo)).toContain('campos_nao_lidos')

    const depois = colunasDoCheque(
      aplicarEdicao(linhaParaExtraido(original), {
        cmc7_bloco1: BLOCO1_OK,
        numero_cheque: '123456',
      }),
    )
    expect(depois.nao_lidos).toEqual([])
    expect(depois.cmc7_completo).not.toContain('?')
    expect(depois.alertas.map((a) => a.codigo)).not.toContain('campos_nao_lidos')
    expect(depois.status).toBe('ok')
  })

  it('renormaliza a chave de agrupamento quando o emitente é corrigido', () => {
    const depois = colunasDoCheque(
      aplicarEdicao(linhaParaExtraido(linha()), { emitente: 'Márcia Lima & Cia' }),
    )
    expect(depois.emitente).toBe('Márcia Lima & Cia')
    expect(depois.emitente_normalizado).toBe('MARCIA LIMA CIA')
  })
})
