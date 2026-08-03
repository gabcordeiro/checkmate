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
  NOME_BLOCO,
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
        titulo: `Não deu para ler o ${NOME_BLOCO[numero]} do CMC7`,
        detalhe: `O CMC7 é a fileira de números no rodapé do cheque. Essa parte não saiu legível na foto. Tire outra foto de perto, com o rodapé nítido e sem reflexo.`,
        campo: `cmc7_bloco${numero}`,
        dados: { bloco: numero },
      })
      continue
    }

    if (!checagem.tamanhoOk) {
      alertas.push({
        nivel: 'amarelo',
        codigo: `cmc7_bloco${numero}_tamanho`,
        titulo: `Faltou ou sobrou número no ${NOME_BLOCO[numero]} do CMC7`,
        detalhe: `Foram lidos ${checagem.digitos.length} números, mas esse grupo tem sempre ${checagem.tamanhoEsperado}. Confira contando na foto, no rodapé do cheque.`,
        campo: `cmc7_bloco${numero}`,
        dados: {
          bloco: numero,
          lidos: checagem.digitos.length,
          esperados: checagem.tamanhoEsperado,
        },
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
            ? `o ${e.posicao}º número parecia ${outros.join(' ou ')} na foto, mas é ${e.digito} — só com ${e.digito} a conta de conferência fecha`
            : `o ${e.posicao}º número é ${e.digito}`
        })
        .join('; ')

      alertas.push({
        nivel: 'amarelo',
        codigo: `cmc7_bloco${numero}_dv_resolvido`,
        titulo: 'Corrigimos um número do CMC7 para você',
        detalhe: `No ${NOME_BLOCO[numero]}, ${resumo}. O CMC7 na tela já está corrigido — pode copiar.`,
        campo: `cmc7_bloco${numero}`,
        dados: {
          bloco: numero,
          posicao: combinacao.escolhas[0]?.posicao ?? 0,
          corrigido: combinacao.blocoCorrigido,
          original: checagem.digitos,
        },
      })
      continue
    }

    if (combinacoes.length > 1) {
      alertas.push({
        nivel: 'amarelo',
        codigo: `cmc7_bloco${numero}_dv_ambiguo`,
        titulo: `Duas leituras possíveis no ${NOME_BLOCO[numero]} do CMC7`,
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
      titulo: `Algum número do ${NOME_BLOCO[numero]} do CMC7 foi lido errado`,
      detalhe: `O último número desse grupo é de conferência: ele tem que bater com uma conta feita a partir dos outros. Na foto ele está ${checagem.dvLido}, mas a conta dá ${checagem.dvEsperado} — ou seja, algum número do grupo saiu errado na leitura. Confira no rodapé do cheque; se não der para ler, tire outra foto.`,
      campo: `cmc7_bloco${numero}`,
      dados: {
        bloco: numero,
        naFoto: checagem.dvLido ?? '—',
        pelaConta: checagem.dvEsperado ?? '—',
        grupoLido: checagem.digitos,
      },
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
        titulo: 'O banco impresso e o do CMC7 são diferentes',
        detalhe: `No alto do cheque está o banco ${bancoImpresso}, mas o CMC7 do rodapé diz ${bancoCmc7}. Um dos dois foi lido errado — confira na foto.`,
        campo: 'banco_codigo',
        dados: { impresso: bancoImpresso, noCmc7: bancoCmc7 },
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
        titulo: 'A agência impressa e a do CMC7 são diferentes',
        detalhe: `No alto do cheque está a agência ${agenciaImpressa}, mas o CMC7 do rodapé diz ${agenciaCmc7}. Um dos dois foi lido errado — confira na foto.`,
        campo: 'agencia',
        dados: { impresso: agenciaImpressa, noCmc7: agenciaCmc7 },
      })
    }
  }

  const numeroImpresso = somenteDigitos(cheque.numero_cheque)
  if (numeroImpresso && bloco2 && !bloco2.includes(numeroImpresso)) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'cruzamento_numero_cheque',
      titulo: 'O nº do cheque não aparece dentro do CMC7',
      detalhe: `O número impresso é ${numeroImpresso}, mas ele não aparece no 2º grupo do CMC7 (${bloco2}), onde deveria estar. Um dos dois foi lido errado.`,
      campo: 'numero_cheque',
      dados: { impresso: numeroImpresso, noCmc7: bloco2 },
    })
  }

  const contaImpressa = somenteDigitos(cheque.conta)
  if (contaImpressa.length >= 4 && bloco3 && !bloco3.includes(contaImpressa)) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'cruzamento_conta',
      titulo: 'A conta não aparece dentro do CMC7',
      detalhe: `A conta impressa é ${contaImpressa}, mas ela não aparece no 3º grupo do CMC7 (${bloco3}), onde deveria estar. Um dos dois foi lido errado.`,
      campo: 'conta',
      dados: { impresso: contaImpressa, noCmc7: bloco3 },
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
      titulo: 'Não conseguimos ler o valor em números',
      detalhe: 'Sem ele não dá para comparar com o valor por extenso, que é a comparação que evita devolução. Confira na foto e corrija aqui.',
      campo: 'valor_numerico',
    })
  }

  if (!cheque.valor_extenso_texto?.trim()) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'valor_extenso_ausente',
      titulo: 'Não conseguimos ler o valor por extenso',
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
      titulo: 'O valor por extenso não deu para interpretar',
      detalhe: `Lemos "${cheque.valor_extenso_texto.trim()}" e não conseguimos transformar isso num valor. Confira você mesma se o extenso bate com o número.`,
      dados: { transcricao: cheque.valor_extenso_texto.trim() },
      campo: 'valor_extenso_texto',
    })
    return { valorExtensoConvertido: null }
  }

  if (extenso.palavrasIgnoradas.length > 0) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'valor_extenso_parcial',
      titulo: 'Há palavras que não entendemos no valor por extenso',
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
      titulo: 'O banco vai devolver: os dois valores não batem',
      detalhe: `Por extenso está escrito ${formatarBRL(extenso.valor)} e em números ${formatarBRL(
        numerico,
      )}. Quando os dois discordam, o banco paga o que está por extenso (Lei do Cheque, art. 12) — e devolve se não houver saldo para ele.`,
      campo: 'valor_numerico',
      dados: {
        porExtenso: formatarBRL(extenso.valor),
        emNumeros: formatarBRL(numerico),
        transcricao: cheque.valor_extenso_texto?.trim() ?? '',
      },
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
      titulo: 'Não conseguimos ler a data do cheque',
      detalhe:
        'Cheque sem data legível é devolvido. Confira na foto e, se estiver rasurada, o cheque não serve.',
      campo: 'data_emissao',
    })
  } else if (dataRasurada) {
    alertas.push({
      nivel: 'vermelho',
      codigo: 'data_rasurada',
      titulo: 'A data está rasurada',
      detalhe: `Lemos ${formatarDataBr(cheque.data_emissao)}, mas há rasura em cima da data. Rasura na data é motivo de devolução, mesmo que dê para ler o que está escrito.`,
      campo: 'data_emissao',
      dados: { dataLida: formatarDataBr(cheque.data_emissao) },
    })
  }

  if (emissao && bomPara && bomPara.getTime() < emissao.getTime()) {
    alertas.push({
      nivel: 'vermelho',
      codigo: 'bom_para_anterior_emissao',
      titulo: 'O "bom p/" é antes da data escrita no cheque',
      detalhe: `Está anotado "bom p/ ${formatarDataBr(cheque.bom_para_anotado)}", mas no campo da data o cheque foi preenchido com ${formatarDataBr(
        cheque.data_emissao,
      )} — uma data depois. Quem manda no banco é a data escrita no cheque. Confirme com o cliente qual das duas vale antes de operar.`,
      campo: 'bom_para',
      dados: {
        bomPara: formatarDataBr(cheque.bom_para_anotado),
        dataDoCheque: formatarDataBr(cheque.data_emissao),
      },
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
      titulo: 'Não achamos assinatura no cheque',
      detalhe: 'Cheque sem assinatura o banco devolve na hora, sem análise. Confira na foto — se a assinatura estiver lá e nós não vimos, corrija aqui em "Corrigir".',
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
        titulo: `Rasura em campo que o banco não perdoa: ${critico.chave}`,
        detalhe: `Encontramos: "${rasura}". Rasura no nominal, no valor ou na data é motivo de devolução — nesses três campos o banco não aceita emenda.`,
        campo: critico.chave,
      })
    } else {
      alertas.push({
        nivel: 'amarelo',
        codigo: 'rasura_outro_campo',
        titulo: 'Tem uma rasura no cheque',
        detalhe: `Encontramos: "${rasura}". Não é num dos campos que o banco recusa direto, mas confira na foto se atrapalha.`,
      })
    }
  }

  if (!cheque.nominal?.trim()) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'nominal_vazio',
      titulo: 'O cheque está sem nominal (ao portador)',
      detalhe: 'Ninguém foi escrito no "pague a". Confirme se a operação aceita cheque ao portador antes de lançar.',
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
      titulo: 'A leitura ficou em dúvida nestes campos',
      detalhe: `A IA marcou como incerto: ${baixaConfianca.join(', ')}. Não quer dizer que está errado — quer dizer que ela não teve certeza. Confira na foto antes de lançar.`,
      dados: { campos: baixaConfianca.join(', ') },
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
