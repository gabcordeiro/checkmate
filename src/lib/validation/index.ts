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
  temIlegivel,
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
        detalhe:
          'O CMC7 é a fileira de números no rodapé do cheque. Essa parte não saiu na foto. Tire outra foto de perto, com o rodapé nítido e sem reflexo.',
        campo: `cmc7_bloco${numero}`,
        dados: { bloco: numero },
      })
      continue
    }

    // Caracteres que a IA não leu já aparecem como `?` vermelho na tela, onde a
    // operadora clica e digita. Repetir isso como alerta seria dizer duas vezes
    // a mesma coisa — e foi ler o alerta que confundiu, não ver o `?`.
    if (checagem.ilegivel) continue

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
      // Sem o tamanho certo, a conferência interna rodaria sobre dados que não
      // são os do cheque e acusaria erro sempre. Um problema, um alerta.
      continue
    }

    if (checagem.dvOk) continue

    // A conferência interna não fechou. Antes de avisar, testamos as leituras
    // alternativas que o próprio modelo marcou como ambíguas (3 ou 8?).
    const combinacoes = combinacoesQueFecham(numero, valor, duvidosos)

    if (combinacoes.length === 1) {
      // Resolvido sozinho: o dígito certo aparece destacado no CMC7 da tela e o
      // contador diz "1 número corrigido". Não vira alerta — não há nada para a
      // operadora fazer.
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
      continue
    }

    if (combinacoes.length > 1) {
      alertas.push({
        nivel: 'amarelo',
        codigo: `cmc7_bloco${numero}_dv_ambiguo`,
        titulo: 'Confira o CMC7 na foto',
        detalhe: `Há mais de uma leitura possível para um dos números. Amplie a foto e confira o dígito destacado antes de lançar.`,
        campo: `cmc7_bloco${numero}`,
        dados: { bloco: numero },
      })
      continue
    }

    // Tamanho certo, nenhum `?`, nenhuma dúvida declarada — e mesmo assim a
    // conferência interna do número não bate. Ou seja: a IA leu algum dígito
    // errado sem perceber. É o caso mais perigoso (parece certo e não é), então
    // avisa — mas sem falar em bloco, dígito verificador ou somatória.
    alertas.push({
      nivel: 'amarelo',
      codigo: `cmc7_bloco${numero}_dv_invalido`,
      titulo: 'Confira o CMC7 na foto',
      detalhe:
        'A conferência do próprio número não bateu, o que costuma significar um dígito lido errado. Amplie a foto e compare com o rodapé do cheque.',
      campo: `cmc7_bloco${numero}`,
      dados: { bloco: numero, grupoLido: checagem.digitos },
    })
  }
}

// ---------------------------------------------------------------------------
// 2. Cruzamento entre CMC7 e os campos impressos no cabeçalho
// ---------------------------------------------------------------------------

/** Aplica ao bloco as correções que a conferência interna já confirmou. */
function blocoCorrigido(
  valor: string | null | undefined,
  numero: NumeroBloco,
  sugestoes: SugestaoCmc7[],
): string {
  // Bloco com `?` não entra em cruzamento: `somenteDigitos` descartaria a
  // lacuna e a comparação passaria a ser feita contra um número mais curto do
  // que o do cheque — acusando divergência que não existe.
  if (temIlegivel(valor)) return ''
  let saida = somenteDigitos(valor)
  for (const s of sugestoes.filter((s) => s.bloco === numero)) {
    if (s.posicao >= 1 && s.posicao <= saida.length) {
      saida = saida.slice(0, s.posicao - 1) + s.digito + saida.slice(s.posicao)
    }
  }
  return saida
}

/**
 * O cruzamento roda sobre o CMC7 JÁ CORRIGIDO.
 *
 * Comparar com a leitura crua acusaria "a agência do CMC7 é diferente da
 * impressa" logo depois de a própria conferência interna ter consertado aquele
 * dígito — dois alertas contraditórios sobre o mesmo número.
 */
function validarCruzamentoInterno(
  cheque: ChequeExtraido,
  alertas: Alerta[],
  sugestoes: SugestaoCmc7[],
): void {
  const bloco1 = blocoCorrigido(cheque.cmc7?.bloco1, 1, sugestoes)
  const bloco2 = blocoCorrigido(cheque.cmc7?.bloco2, 2, sugestoes)
  const bloco3 = blocoCorrigido(cheque.cmc7?.bloco3, 3, sugestoes)

  const bancoImpresso = (temIlegivel(cheque.banco_codigo) ? '' : somenteDigitos(cheque.banco_codigo))
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

  const agenciaImpressa = (temIlegivel(cheque.agencia) ? '' : somenteDigitos(cheque.agencia))
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

  const numeroImpresso = (temIlegivel(cheque.numero_cheque) ? '' : somenteDigitos(cheque.numero_cheque))
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

  const contaImpressa = (temIlegivel(cheque.conta) ? '' : somenteDigitos(cheque.conta))
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

  // Campo que a IA não leu já aparece como `?` vermelho na tela e entra no
  // aviso único de "campos não lidos". Aqui só tratamos o que é do conteúdo do
  // cheque, não da qualidade da leitura.
  const naoLeuNumerico = cheque.nao_lidos.includes('valor_numerico')
  const naoLeuExtenso = cheque.nao_lidos.includes('valor_extenso_texto')

  if (!cheque.valor_extenso_texto?.trim() && !naoLeuExtenso) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'valor_extenso_ausente',
      titulo: 'O cheque está sem o valor por extenso',
      detalhe:
        'A linha do extenso aparece em branco. Cheque sem extenso o banco devolve — confira na foto.',
      campo: 'valor_extenso_texto',
    })
    return { valorExtensoConvertido: null }
  }

  if (!cheque.valor_extenso_texto?.trim()) return { valorExtensoConvertido: null }

  // Leitura parcial: comparar aqui produziria um valor MENOR que o do cheque e
  // um "o banco vai devolver" vermelho por erro de leitura nosso. Falso vermelho
  // destrói a confiança no semáforo, que é o que o produto vende.
  if (extenso.parcial) {
    alertas.push({
      nivel: 'amarelo',
      codigo: 'valor_extenso_parcial',
      titulo: 'Não lemos o valor por extenso inteiro',
      detalhe:
        'Falta um pedaço da frase, então não dá para comparar com o valor em números. Amplie a foto, complete o que está marcado e a comparação roda sozinha.',
      campo: 'valor_extenso_texto',
      dados: { transcricao: cheque.valor_extenso_texto.trim() },
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
      codigo: 'valor_extenso_palavras',
      titulo: 'Há palavras que não entendemos no valor por extenso',
      detalhe: `Ignoradas: ${extenso.palavrasIgnoradas.join(', ')}. O valor interpretado (${formatarBRL(
        extenso.valor,
      )}) pode estar incompleto.`,
      campo: 'valor_extenso_texto',
    })
  }

  // Sem o valor em números não há o que comparar — e o `?` já avisa.
  if (naoLeuNumerico) return { valorExtensoConvertido: extenso.valor }

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

  // A distinção que o `?` tornou possível: "não consegui ler" é problema NOSSO
  // (amarelo, ela digita e resolve); "o cheque está sem data" é problema DO
  // CHEQUE (vermelho, o banco devolve). Antes os dois davam vermelho, e a
  // operadora levava um susto por uma falha de leitura.
  if (!emissao && cheque.nao_lidos.includes('data_emissao')) {
    // Coberto pelo aviso único de campos não lidos + o `?` na tela.
  } else if (!emissao) {
    alertas.push({
      nivel: 'vermelho',
      codigo: 'data_emissao_ausente',
      titulo: 'O cheque está sem data',
      detalhe:
        'O campo da data aparece em branco. Cheque sem data o banco devolve — peça ao cliente para preencher.',
      campo: 'data_emissao',
    })
  }

  if (emissao && dataRasurada) {
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
// 4b. Campos que a IA não conseguiu ler
// ---------------------------------------------------------------------------

const NOME_AMIGAVEL: Record<string, string> = {
  valor_numerico: 'valor em números',
  valor_extenso_texto: 'valor por extenso',
  data_emissao: 'data do cheque',
  bom_para_anotado: 'bom p/',
  nominal: 'nominal',
  emitente: 'emitente',
  banco_codigo: 'banco',
  agencia: 'agência',
  conta: 'conta',
  numero_cheque: 'nº do cheque',
}

/**
 * UM alerta para tudo que não foi lido, em vez de um por campo.
 *
 * O detalhe de cada lacuna já está na tela, no `?` vermelho em cima do campo,
 * onde ela clica e digita. Este alerta existe só para o cheque aparecer no
 * painel do lote — senão ela teria de varrer linha por linha para achar o que
 * falta preencher.
 */
function validarCamposNaoLidos(cheque: ChequeExtraido, alertas: Alerta[]): void {
  const campos = (cheque.nao_lidos ?? []).map((c) => NOME_AMIGAVEL[c] ?? c)

  // Lacuna dentro de um texto conta junto: é a mesma pergunta para a operadora.
  const blocosComLacuna = ([1, 2, 3] as const).filter((n) =>
    temIlegivel(cheque.cmc7?.[`bloco${n}`]),
  )
  if (blocosComLacuna.length > 0) campos.push('CMC7')

  if (campos.length === 0) return

  const lista = [...new Set(campos)]
  alertas.push({
    nivel: 'amarelo',
    codigo: 'campos_nao_lidos',
    titulo:
      lista.length === 1
        ? `Não conseguimos ler: ${lista[0]}`
        : `Não conseguimos ler ${lista.length} campos`,
    detalhe: `Está marcado com ? na tela: ${lista.join(', ')}. Amplie a foto, digite o que você vê e o ? some.`,
    dados: { campos: lista.join(', ') },
  })
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
  validarCruzamentoInterno(cheque, alertas, sugestoes)
  const { valorExtensoConvertido } = validarValores(cheque, alertas)
  const { dataEfetiva } = validarDatas(cheque, alertas, referencia)
  validarCamposNaoLidos(cheque, alertas)
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
