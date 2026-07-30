/**
 * Validação determinística do cheque — o coração do produto.
 *
 * Roda 100% em código puro sobre o JSON que o modelo de visão extraiu. Nenhuma
 * decisão vem do modelo: ele diz o que leu, aqui a gente diz o que está errado.
 * Por isso este módulo não importa nada de rede, Supabase ou React — é testável
 * com `npm test` e é onde os casos reais de cheque viram regressão.
 *
 * Níveis:
 *   vermelho — o banco pode DEVOLVER o cheque (prejuízo direto)
 *   amarelo  — leitura suspeita, a operadora precisa conferir no olho
 */

import { formatarBRL } from '../format'
import {
  agenciaDoBloco1,
  bancoDoBloco1,
  checarBloco,
  combinacoesQueFecham,
  somenteDigitos,
  type NumeroBloco,
} from './cmc7'
import {
  DIAS_FUTURO_SUSPEITO,
  DIAS_PASSADO_SUSPEITO,
  diasEntre,
  formatarDataBr,
  hojeUtc,
  parseDataIso,
} from './datas'
import { parseExtenso } from './extenso'
import type {
  Alerta,
  ChequeExtraido,
  ResultadoValidacao,
  StatusCheque,
  SugestaoCmc7,
} from './types'

export * from './types'
export * from './cmc7'
export * from './datas'
export * from './extenso'

/** Tolerância na comparação de dinheiro: 1 centavo. */
const TOLERANCIA_CENTAVOS = 0.005

const CAMPOS_CRITICOS_RASURA = [
  { chave: 'nominal', termos: ['nominal', 'favorecido', 'beneficiario', 'nome'] },
  { chave: 'valor', termos: ['valor', 'extenso', 'algarismo', 'numeric'] },
  { chave: 'data', termos: ['data', 'emissao', 'bom para', 'bom p'] },
]

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

/** vermelho > amarelo > ok. Exportado porque a persistência também recalcula. */
export function statusDosAlertas(alertas: Alerta[]): StatusCheque {
  if (alertas.some((a) => a.nivel === 'vermelho')) return 'vermelho'
  if (alertas.length > 0) return 'conferir'
  return 'ok'
}

// ---------------------------------------------------------------------------
// 1. DV do CMC7 + resolução dos dígitos duvidosos
// ---------------------------------------------------------------------------

function validarCmc7(
  cheque: ChequeExtraido,
  alertas: Alerta[],
  sugestoes: SugestaoCmc7[],
): void {
  const blocos: Array<{ numero: NumeroBloco; valor: string | null }> = [
    { numero: 1, valor: cheque.cmc7?.bloco1 ?? null },
    { numero: 2, valor: cheque.cmc7?.bloco2 ?? null },
    { numero: 3, valor: cheque.cmc7?.bloco3 ?? null },
  ]
  const duvidosos = cheque.cmc7?.digitos_duvidosos ?? []

  for (const { numero, valor } of blocos) {
    const checagem = checarBloco(numero, valor)

    if (!checagem.presente) {
      alertas.push({
        nivel: 'amarelo',
        codigo: `cmc7_bloco${numero}_ausente`,
        titulo: `Bloco ${numero} do CMC7 não foi lido`,
        detalhe: 'Refotografe o cheque de perto, com a tarja do CMC7 nítida e sem reflexo.',
        campo: `cmc7_bloco${numero}`,
      })
      continue
    }

    if (!checagem.tamanhoOk) {
      alertas.push({
        nivel: 'amarelo',
        codigo: `cmc7_bloco${numero}_tamanho`,
        titulo: `Bloco ${numero} com ${checagem.digitos.length} dígitos (esperado ${checagem.tamanhoEsperado})`,
        detalhe: 'Falta ou sobra dígito na leitura. Confira contra a tarja da foto antes de lançar.',
        campo: `cmc7_bloco${numero}`,
      })
    }

    if (checagem.dvOk) continue

    // DV não fechou. Antes de mandar refotografar, testamos as alternativas
    // que o próprio modelo marcou como duvidosas.
    const combinacoes = combinacoesQueFecham(numero, valor, duvidosos)

    if (combinacoes.length === 1) {
      const combinacao = combinacoes[0]
      for (const escolha of combinacao.escolhas) {
        const original = duvidosos.find(
          (d) => d.bloco === numero && d.posicao === escolha.posicao,
        )
        const descartados = (original?.alternativas ?? [])
          .map((a) => somenteDigitos(a))
          .filter((a) => a.length === 1 && a !== escolha.digito)

        sugestoes.push({
          bloco: numero,
          posicao: escolha.posicao,
          digito: escolha.digito,
          descartados,
          bloco_corrigido: combinacao.blocoCorrigido,
        })
      }

      const resumo = combinacao.escolhas
        .map((e) => {
          const original = duvidosos.find((d) => d.bloco === numero && d.posicao === e.posicao)
          const outros = (original?.alternativas ?? [])
            .map((a) => somenteDigitos(a))
            .filter((a) => a.length === 1 && a !== e.digito)
          return outros.length
            ? `posição ${e.posicao}: provavelmente ${e.digito} — com ${outros.join('/')} o verificador não bate`
            : `posição ${e.posicao}: ${e.digito}`
        })
        .join('; ')

      alertas.push({
        nivel: 'amarelo',
        codigo: `cmc7_bloco${numero}_dv_resolvido`,
        titulo: `Bloco ${numero}: dígito duvidoso resolvido pelo verificador`,
        detalhe: `${resumo}. Bloco sugerido: ${combinacao.blocoCorrigido}`,
        campo: `cmc7_bloco${numero}`,
      })
      continue
    }

    if (combinacoes.length > 1) {
      alertas.push({
        nivel: 'amarelo',
        codigo: `cmc7_bloco${numero}_dv_ambiguo`,
        titulo: `Bloco ${numero}: mais de uma leitura fecha o verificador`,
        detalhe: `Candidatos: ${combinacoes
          .slice(0, 6)
          .map((c) => c.blocoCorrigido)
          .join(', ')}. Confira o dígito na foto antes de lançar.`,
        campo: `cmc7_bloco${numero}`,
      })
      continue
    }

    alertas.push({
      nivel: 'amarelo',
      codigo: `cmc7_bloco${numero}_dv_invalido`,
      titulo: `Bloco ${numero}: dígito verificador não fecha`,
      detalhe: `Lido ${checagem.dvLido}, calculado ${checagem.dvEsperado}. Nenhuma alternativa de leitura fecha o verificador — refotografe o cheque.`,
      campo: `cmc7_bloco${numero}`,
    })
  }
}

// ---------------------------------------------------------------------------
// 2. Cruzamento entre CMC7 e os campos impressos no cabeçalho
// ---------------------------------------------------------------------------

function validarCruzamentoInterno(cheque: ChequeExtraido, alertas: Alerta[]): void {
  const bloco1 = somenteDigitos(cheque.cmc7?.bloco1)
  const bloco2 = somenteDigitos(cheque.cmc7?.bloco2)
  const bloco3 = somenteDigitos(cheque.cmc7?.bloco3)

  const bancoImpresso = somenteDigitos(cheque.banco_codigo)
  if (bancoImpresso && bloco1) {
    const bancoCmc7 = bancoDoBloco1(bloco1)
    if (bancoCmc7 && bancoImpresso.padStart(3, '0') !== bancoCmc7) {
      alertas.push({
        nivel: 'amarelo',
        codigo: 'cruzamento_banco',
        titulo: 'Banco do CMC7 não bate com o impresso',
        detalhe: `Cabeçalho: ${bancoImpresso} · CMC7 bloco 1: ${bancoCmc7}. Provável erro de leitura.`,
        campo: 'banco_codigo',
      })
    }
  }

  const agenciaImpressa = somenteDigitos(cheque.agencia)
  if (agenciaImpressa && bloco1) {
    const agenciaCmc7 = agenciaDoBloco1(bloco1)
    if (agenciaCmc7 && agenciaImpressa.padStart(4, '0') !== agenciaCmc7) {
      alertas.push({
        nivel: 'amarelo',
        codigo: 'cruzamento_agencia',
        titulo: 'Agência do CMC7 não bate com a impressa',
        detalhe: `Cabeçalho: ${agenciaImpressa} · CMC7 bloco 1: ${agenciaCmc7}. Provável erro de leitura.`,
        campo: 'agencia',
      })
    }
  }

  const numeroImpresso = somenteDigitos(cheque.numero_cheque)
  if (numeroImpresso && bloco2 && !bloco2.includes(numeroImpresso)) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'cruzamento_numero_cheque',
      titulo: 'Número do cheque não aparece no CMC7',
      detalhe: `Impresso: ${numeroImpresso} · CMC7 bloco 2: ${bloco2}. Provável erro de leitura em um dos dois.`,
      campo: 'numero_cheque',
    })
  }

  const contaImpressa = somenteDigitos(cheque.conta)
  if (contaImpressa.length >= 4 && bloco3 && !bloco3.includes(contaImpressa)) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'cruzamento_conta',
      titulo: 'Conta não aparece no CMC7',
      detalhe: `Impressa: ${contaImpressa} · CMC7 bloco 3: ${bloco3}. Provável erro de leitura em um dos dois.`,
      campo: 'conta',
    })
  }
}

// ---------------------------------------------------------------------------
// 3. Extenso × numérico — o alerta que mais paga a ferramenta
// ---------------------------------------------------------------------------

function validarValores(
  cheque: ChequeExtraido,
  alertas: Alerta[],
): { valorExtensoConvertido: number | null } {
  const extenso = parseExtenso(cheque.valor_extenso_texto)
  const numerico =
    typeof cheque.valor_numerico === 'number' && Number.isFinite(cheque.valor_numerico)
      ? cheque.valor_numerico
      : null

  if (numerico === null) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'valor_numerico_ausente',
      titulo: 'Valor em algarismos não foi lido',
      detalhe: 'Confira o valor na foto — sem ele não é possível cruzar com o extenso.',
      campo: 'valor_numerico',
    })
  }

  if (!cheque.valor_extenso_texto?.trim()) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'valor_extenso_ausente',
      titulo: 'Valor por extenso não foi lido',
      detalhe:
        'Sem o extenso não dá para checar a divergência que faz o banco devolver. Confira no olho.',
      campo: 'valor_extenso_texto',
    })
    return { valorExtensoConvertido: null }
  }

  if (!extenso.interpretado || extenso.valor === null) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'valor_extenso_ilegivel',
      titulo: 'Extenso não pôde ser interpretado',
      detalhe: `Transcrição: "${cheque.valor_extenso_texto.trim()}". Confira o extenso no olho contra o valor em algarismos.`,
      campo: 'valor_extenso_texto',
    })
    return { valorExtensoConvertido: null }
  }

  if (extenso.palavrasIgnoradas.length > 0) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'valor_extenso_parcial',
      titulo: 'Extenso com palavras não reconhecidas',
      detalhe: `Ignoradas: ${extenso.palavrasIgnoradas.join(', ')}. O valor interpretado (${formatarBRL(
        extenso.valor,
      )}) pode estar incompleto.`,
      campo: 'valor_extenso_texto',
    })
  }

  if (numerico !== null && Math.abs(extenso.valor - numerico) > TOLERANCIA_CENTAVOS) {
    alertas.push({
      nivel: 'vermelho',
      codigo: 'extenso_divergente',
      titulo: 'Banco devolve: extenso divergente do numérico',
      detalhe: `Extenso indica ${formatarBRL(extenso.valor)}, numérico indica ${formatarBRL(
        numerico,
      )}. Vale o extenso (Lei do Cheque, art. 12).`,
      campo: 'valor_numerico',
    })
  }

  return { valorExtensoConvertido: extenso.valor }
}

// ---------------------------------------------------------------------------
// 4. Datas
// ---------------------------------------------------------------------------

function validarDatas(
  cheque: ChequeExtraido,
  alertas: Alerta[],
  referencia: Date,
): { dataEfetiva: string | null } {
  const emissao = parseDataIso(cheque.data_emissao)
  const bomPara = parseDataIso(cheque.bom_para_anotado)
  const hoje = hojeUtc(referencia)

  const dataRasurada = (cheque.rasuras_detectadas ?? []).some((r) => {
    const n = normalizar(r)
    return n.includes('data') || n.includes('emissao')
  })

  if (!emissao) {
    alertas.push({
      nivel: 'vermelho',
      codigo: 'data_emissao_ilegivel',
      titulo: 'Data de emissão ilegível',
      detalhe:
        'Cheque sem data legível é devolvido. Confira na foto e, se estiver rasurada, o cheque não serve.',
      campo: 'data_emissao',
    })
  } else if (dataRasurada) {
    alertas.push({
      nivel: 'vermelho',
      codigo: 'data_rasurada',
      titulo: 'Data rasurada',
      detalhe: `Data lida ${formatarDataBr(cheque.data_emissao)}, mas há rasura na data. Rasura em data faz o banco devolver.`,
      campo: 'data_emissao',
    })
  }

  if (emissao && bomPara && bomPara.getTime() < emissao.getTime()) {
    alertas.push({
      nivel: 'vermelho',
      codigo: 'bom_para_anterior_emissao',
      titulo: 'Bom para anterior à data do cheque',
      detalhe: `"Bom p/" ${formatarDataBr(cheque.bom_para_anotado)} é anterior à data escrita no cheque (${formatarDataBr(
        cheque.data_emissao,
      )}). Vale a data escrita no cheque — o combinado com o cliente não bate com o que o banco vai compensar.`,
      campo: 'bom_para',
    })
  }

  for (const [campo, data, rotulo] of [
    ['data_emissao', emissao, 'Data de emissão'],
    ['bom_para', bomPara, 'Bom para'],
  ] as const) {
    if (!data) continue
    const dias = diasEntre(hoje, data)
    if (dias < -DIAS_PASSADO_SUSPEITO) {
      alertas.push({
        nivel: 'amarelo',
        codigo: `${campo}_passado_distante`,
        titulo: `${rotulo} muito no passado`,
        detalhe: `${formatarDataBr(
          data.toISOString().slice(0, 10),
        )} está mais de 12 meses atrás. Provável erro de leitura do ano — confira na foto.`,
        campo,
      })
    } else if (dias > DIAS_FUTURO_SUSPEITO) {
      alertas.push({
        nivel: 'amarelo',
        codigo: `${campo}_futuro_distante`,
        titulo: `${rotulo} muito no futuro`,
        detalhe: `${formatarDataBr(
          data.toISOString().slice(0, 10),
        )} está mais de 12 meses à frente. Provável erro de leitura do ano — confira na foto.`,
        campo,
      })
    }
  }

  // Data que manda na ordenação do lote: o "bom para" quando ele é coerente
  // com a emissão; senão a data escrita no cheque.
  let dataEfetiva: string | null = null
  if (bomPara && (!emissao || bomPara.getTime() >= emissao.getTime())) {
    dataEfetiva = cheque.bom_para_anotado ?? null
  } else if (emissao) {
    dataEfetiva = cheque.data_emissao ?? null
  }

  return { dataEfetiva }
}

// ---------------------------------------------------------------------------
// 5. Checklist visual
// ---------------------------------------------------------------------------

function validarChecklistVisual(cheque: ChequeExtraido, alertas: Alerta[]): void {
  if (cheque.assinatura_presente === false) {
    alertas.push({
      nivel: 'vermelho',
      codigo: 'sem_assinatura',
      titulo: 'Sem assinatura',
      detalhe: 'Nenhuma assinatura detectada. Cheque sem assinatura é devolvido na hora.',
      campo: 'assinatura_presente',
    })
  }

  for (const rasura of cheque.rasuras_detectadas ?? []) {
    const texto = normalizar(rasura)
    if (!texto) continue

    const critico = CAMPOS_CRITICOS_RASURA.find((c) => c.termos.some((t) => texto.includes(t)))

    // Rasura na data já virou alerta em validarDatas — não duplica.
    if (critico?.chave === 'data') continue

    if (critico) {
      alertas.push({
        nivel: 'vermelho',
        codigo: `rasura_${critico.chave}`,
        titulo: `Rasura em campo crítico: ${critico.chave}`,
        detalhe: `"${rasura}". Rasura em nominal, valor ou data faz o banco devolver o cheque.`,
        campo: critico.chave,
      })
    } else {
      alertas.push({
        nivel: 'amarelo',
        codigo: 'rasura_outro_campo',
        titulo: 'Rasura detectada',
        detalhe: `"${rasura}". Confira na foto se compromete a compensação.`,
      })
    }
  }

  if (!cheque.nominal?.trim()) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'nominal_vazio',
      titulo: 'Nominal em branco',
      detalhe: 'Cheque ao portador. Confirme se a operação aceita cheque sem nominal.',
      campo: 'nominal',
    })
  }

  const baixaConfianca = Object.entries(cheque.confianca_por_campo ?? {})
    .filter(([, nivel]) => nivel === 'baixa')
    .map(([campo]) => campo)

  if (baixaConfianca.length > 0) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'confianca_baixa',
      titulo: 'Leitura de baixa confiança',
      detalhe: `Campos: ${baixaConfianca.join(', ')}. Confira estes campos na foto antes de lançar.`,
    })
  }
}

// ---------------------------------------------------------------------------
// Orquestrador
// ---------------------------------------------------------------------------

/** Ordem de exibição: vermelho primeiro, e dentro do nível a ordem de detecção. */
export function ordenarAlertas(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => {
    if (a.nivel === b.nivel) return 0
    return a.nivel === 'vermelho' ? -1 : 1
  })
}

export function validarCheque(
  cheque: ChequeExtraido,
  referencia: Date = new Date(),
): ResultadoValidacao {
  const alertas: Alerta[] = []
  const sugestoes: SugestaoCmc7[] = []

  validarCmc7(cheque, alertas, sugestoes)
  validarCruzamentoInterno(cheque, alertas)
  const { valorExtensoConvertido } = validarValores(cheque, alertas)
  const { dataEfetiva } = validarDatas(cheque, alertas, referencia)
  validarChecklistVisual(cheque, alertas)

  const ordenados = ordenarAlertas(alertas)

  return {
    status: statusDosAlertas(ordenados),
    alertas: ordenados,
    valor_extenso_convertido: valorExtensoConvertido,
    cmc7_sugestoes: sugestoes,
    data_efetiva: dataEfetiva,
  }
}
