/**
 * O que cada alerta significa, em português de gente.
 *
 * Nasceu de um teste com a operadora: diante de "Lido 9, calculado 8" ela disse
 * "não entendi" e teve de adivinhar ("acho que ele quis dizer que leu 9 na foto
 * mas calculado foi 8"). Alerta que precisa ser adivinhado não protege ninguém.
 *
 * A separação é de propósito: o VALIDADOR produz o fato (código + números), e
 * este catálogo ENSINA. Assim a lógica continua testável sem carregar texto
 * didático, e o texto pode crescer sem risco de mexer na regra.
 */

import type { Alerta } from './validation/types'

export interface LinhaComparacao {
  rotulo: string
  valor: string
  /** Destaque visual: o lado que "vale" ou o que está errado. */
  tom?: 'neutro' | 'ok' | 'erro'
}

export interface Explicacao {
  /** Uma frase: o que aconteceu. */
  oQue: string
  /** Por que isso custa dinheiro (ou tempo). */
  porQue: string
  /** Passos concretos, na ordem. */
  oQueFazer: string[]
  /** Comparação lado a lado com os números reais do cheque. */
  comparacao?: LinhaComparacao[]
  /** Um caso concreto para fixar a ideia. */
  exemplo?: string
}

function texto(alerta: Alerta, chave: string): string {
  const valor = alerta.dados?.[chave]
  return valor === undefined || valor === null ? '—' : String(valor)
}

/** Explicação do CMC7 reaproveitada por vários alertas. */
const O_QUE_E_CMC7 =
  'O CMC7 é a fileira de números impressa no rodapé do cheque, em três grupos. É ele que você lança no sistema.'

type Construtor = (alerta: Alerta) => Explicacao

const CATALOGO: Record<string, Construtor> = {
  // ---------------------------------------------------------------------------
  // CMC7
  // ---------------------------------------------------------------------------
  dv_invalido: () => ({
    oQue: 'O número do CMC7 tem uma conferência embutida, e ela não bateu com o que lemos.',
    porQue:
      'Quase sempre significa que um dígito foi lido errado. Lançado assim, o sistema da empresa recusa — ou aceita e cadastra o cheque com o número trocado.',
    oQueFazer: [
      'Amplie a foto (clique na miniatura) e olhe o rodapé do cheque.',
      'Compare com o CMC7 da tela.',
      'Achou a diferença? Use "Corrigir".',
    ],
  }),

  dv_ambiguo: () => ({
    oQue: 'Um dos números do CMC7 tem mais de uma leitura possível e a conferência interna não decide qual é.',
    porQue: 'Lançar o CMC7 errado cadastra o cheque no nome de outra conta.',
    oQueFazer: [
      'Amplie a foto e olhe o dígito destacado na tela.',
      'Use "Corrigir" para escrever o que você viu.',
    ],
  }),

  ausente: () => ({
    oQue: `Uma parte do CMC7 não saiu legível na foto. ${O_QUE_E_CMC7}`,
    porQue: 'Sem o CMC7 completo não há o que lançar no sistema.',
    oQueFazer: [
      'Tire outra foto do cheque, mais de perto.',
      'Deixe o rodapé nítido: é a faixa mais importante da foto.',
      'Evite reflexo — a tarja do CMC7 é impressa em tinta magnética e brilha.',
    ],
  }),

  tamanho: (a) => ({
    oQue: `Esse grupo do CMC7 tem sempre ${texto(a, 'esperados')} números, mas a leitura trouxe ${texto(
      a,
      'lidos',
    )}.`,
    porQue: 'Faltando ou sobrando número, o CMC7 não serve para lançar.',
    oQueFazer: [
      'Amplie a foto e conte os números do grupo.',
      'Corrija na tela, ou tire outra foto se não der para contar.',
    ],
    comparacao: [
      { rotulo: 'Números lidos', valor: texto(a, 'lidos'), tom: 'erro' },
      { rotulo: 'Números esperados', valor: texto(a, 'esperados'), tom: 'ok' },
    ],
  }),

  // ---------------------------------------------------------------------------
  // Cruzamentos
  // ---------------------------------------------------------------------------
  cruzamento_banco: (a) => ({
    oQue: 'O banco impresso no alto do cheque e o que está dentro do CMC7 não são o mesmo.',
    porQue:
      'Os dois vêm do mesmo cheque, então deveriam bater. Um dos dois foi lido errado — e se for o do CMC7, o lançamento vai para o banco errado.',
    oQueFazer: ['Amplie a foto.', 'Veja qual dos dois está certo e corrija o outro.'],
    comparacao: [
      { rotulo: 'No alto do cheque', valor: texto(a, 'impresso') },
      { rotulo: 'Dentro do CMC7', valor: texto(a, 'noCmc7') },
    ],
  }),

  cruzamento_agencia: (a) => ({
    oQue: 'A agência impressa e a que está dentro do CMC7 não são a mesma.',
    porQue: 'As duas vêm do mesmo cheque e deveriam bater. Uma das duas foi lida errado.',
    oQueFazer: ['Amplie a foto.', 'Veja qual das duas está certa e corrija a outra.'],
    comparacao: [
      { rotulo: 'No alto do cheque', valor: texto(a, 'impresso') },
      { rotulo: 'Dentro do CMC7', valor: texto(a, 'noCmc7') },
    ],
  }),

  cruzamento_numero_cheque: (a) => ({
    oQue: 'O número do cheque impresso não aparece dentro do CMC7, onde ele também deveria estar.',
    porQue: 'O mesmo número aparece nos dois lugares. Se não bate, um dos dois foi lido errado.',
    oQueFazer: ['Amplie a foto e confira os dois.', 'Corrija o que estiver errado.'],
    comparacao: [
      { rotulo: 'Nº impresso', valor: texto(a, 'impresso') },
      { rotulo: '2º grupo do CMC7', valor: texto(a, 'noCmc7') },
    ],
  }),

  cruzamento_conta: (a) => ({
    oQue: 'A conta impressa não aparece dentro do CMC7, onde ela também deveria estar.',
    porQue: 'A mesma conta aparece nos dois lugares. Se não bate, uma das duas foi lida errado.',
    oQueFazer: ['Amplie a foto e confira as duas.', 'Corrija o que estiver errado.'],
    comparacao: [
      { rotulo: 'Conta impressa', valor: texto(a, 'impresso') },
      { rotulo: '3º grupo do CMC7', valor: texto(a, 'noCmc7') },
    ],
  }),

  // ---------------------------------------------------------------------------
  // Valores
  // ---------------------------------------------------------------------------
  extenso_divergente: (a) => ({
    oQue: `O cliente escreveu ${texto(a, 'porExtenso')} por extenso e ${texto(
      a,
      'emNumeros',
    )} em números. São valores diferentes.`,
    porQue:
      'Pela Lei do Cheque (art. 12), quando os dois discordam vale o que está POR EXTENSO. Se o extenso for menor, você adiantou dinheiro a mais. Se for maior que o saldo, o cheque volta. Nos dois casos o prejuízo é seu, porque a operação já foi paga.',
    oQueFazer: [
      'Amplie a foto e confira os dois valores com seus próprios olhos.',
      'Se lemos algum deles errado, corrija — o alerta some sozinho.',
      'Se o cliente escreveu errado mesmo, fale com ele antes de operar: esse cheque volta.',
    ],
    comparacao: [
      { rotulo: 'Por extenso (é o que vale)', valor: texto(a, 'porExtenso'), tom: 'ok' },
      { rotulo: 'Em números', valor: texto(a, 'emNumeros'), tom: 'erro' },
      { rotulo: 'Extenso lido na foto', valor: texto(a, 'transcricao') },
    ],
    exemplo:
      'Caso real: o cheque tinha "quatrocentos reais" por extenso e R$ 1.842,00 em números. O banco paga 400 — os outros R$ 1.442,00 viram prejuízo de quem antecipou.',
  }),

  valor_extenso_ilegivel: (a) => ({
    oQue: `Lemos "${texto(a, 'transcricao')}" no campo do extenso e não conseguimos transformar isso num valor.`,
    porQue:
      'Sem interpretar o extenso, não dá para fazer a comparação que evita a devolução mais cara que existe.',
    oQueFazer: [
      'Amplie a foto e leia o extenso.',
      'Confira à mão se ele bate com o valor em números.',
      'Se quiser, corrija a transcrição em "Corrigir" — a comparação roda de novo.',
    ],
  }),

  valor_extenso_ausente: () => ({
    oQue: 'A linha do valor por extenso está em branco no cheque.',
    porQue:
      'É o extenso que manda quando os dois valores discordam. Sem ele, a comparação que evita a devolução mais cara não acontece.',
    oQueFazer: [
      'Amplie a foto e leia a linha do extenso.',
      'Confira à mão se bate com o valor em números.',
      'Se estiver em branco no cheque, o banco devolve — fale com o cliente.',
    ],
  }),

  valor_extenso_palavras: () => ({
    oQue: 'Entendemos o valor por extenso, mas havia palavras que não reconhecemos.',
    porQue:
      'O valor que calculamos pode estar incompleto, e com isso a comparação com o número pode estar errada — para mais ou para menos.',
    oQueFazer: [
      'Amplie a foto e leia o extenso inteiro.',
      'Compare com o valor em números você mesma.',
      'Se a transcrição estiver errada, corrija — a conta refaz sozinha.',
    ],
  }),

  rasura_outro_campo: () => ({
    oQue: 'Encontramos uma rasura, mas fora dos três campos que o banco recusa direto.',
    porQue:
      'Os campos em que rasura derruba o cheque são nominal, valor e data. Em outros lugares é menos grave, mas ainda pode gerar discussão.',
    oQueFazer: ['Amplie a foto e veja onde é a rasura.', 'Decida se compromete a operação.'],
  }),

  valor_numerico_ausente: () => ({
    oQue: 'Não conseguimos ler o valor escrito em números.',
    porQue: 'Sem ele não há como comparar com o extenso, que é a comparação que pega devolução.',
    oQueFazer: ['Amplie a foto.', 'Digite o valor em "Corrigir".'],
  }),

  // ---------------------------------------------------------------------------
  // Datas
  // ---------------------------------------------------------------------------
  bom_para_anterior_emissao: (a) => ({
    oQue: `O "bom p/" anotado é ${texto(a, 'bomPara')}, mas no campo da data o cheque foi preenchido com ${texto(
      a,
      'dataDoCheque',
    )} — uma data depois.`,
    porQue:
      'O "bom p/" é combinado entre você e o cliente; o banco não vê essa anotação. O que o banco enxerga é a data escrita no campo. Então o combinado e o que vai acontecer no banco são coisas diferentes aqui.',
    oQueFazer: [
      'Confirme com o cliente qual das duas datas vale.',
      'Se a data escrita no cheque estiver errada, o cliente precisa refazer o cheque.',
      'Se nós lemos alguma das datas errado, corrija aqui.',
    ],
    comparacao: [
      { rotulo: 'Combinado ("bom p/")', valor: texto(a, 'bomPara'), tom: 'neutro' },
      { rotulo: 'Escrito no cheque (o que o banco vê)', valor: texto(a, 'dataDoCheque'), tom: 'erro' },
    ],
  }),

  data_emissao_ilegivel: () => ({
    oQue: 'Não conseguimos ler a data escrita no cheque.',
    porQue:
      'Cheque sem data legível é devolvido. E sem data você também não consegue posicionar esse cheque na fila de vencimentos da operação.',
    oQueFazer: [
      'Amplie a foto e veja se a data está legível.',
      'Está legível? Digite em "Corrigir".',
      'Está rasurada ou em branco? Esse cheque não serve — fale com o cliente.',
    ],
  }),

  data_rasurada: (a) => ({
    oQue: `Lemos ${texto(a, 'dataLida')}, mas há rasura em cima da data.`,
    porQue:
      'Data é um dos três campos em que o banco não aceita emenda (os outros são nominal e valor). Mesmo dando para ler o que está escrito, a rasura sozinha já é motivo de devolução.',
    oQueFazer: [
      'Amplie a foto e confirme se é rasura mesmo.',
      'Se for, não opere esse cheque: peça outro ao cliente.',
      'Se não for rasura (borrão, sombra), corrija em "Corrigir".',
    ],
  }),

  // ---------------------------------------------------------------------------
  // Checklist visual
  // ---------------------------------------------------------------------------
  sem_assinatura: () => ({
    oQue: 'Não encontramos traço de assinatura no campo de assinatura.',
    porQue:
      'Cheque sem assinatura o banco devolve na hora, sem nem analisar. É a devolução mais simples de evitar e a mais boba de deixar passar.',
    oQueFazer: [
      'Amplie a foto e olhe o campo de assinatura.',
      'Tem assinatura e nós não vimos? Marque em "Corrigir" — acontece com assinatura clara ou caneta fraca.',
      'Está mesmo em branco? Devolva o cheque ao cliente para assinar.',
    ],
  }),

  rasura_nominal: () => ({
    oQue: 'Há rasura no nome de quem recebe o cheque.',
    porQue: 'Nominal, valor e data são os três campos em que o banco não aceita emenda.',
    oQueFazer: ['Amplie a foto e confirme.', 'Se for rasura mesmo, peça outro cheque ao cliente.'],
  }),

  rasura_valor: () => ({
    oQue: 'Há rasura no valor.',
    porQue: 'Nominal, valor e data são os três campos em que o banco não aceita emenda.',
    oQueFazer: ['Amplie a foto e confirme.', 'Se for rasura mesmo, peça outro cheque ao cliente.'],
  }),

  nominal_vazio: () => ({
    oQue: 'O campo "pague a" está em branco — o cheque está ao portador.',
    porQue:
      'Cheque ao portador vale, mas qualquer um que estiver com ele pode descontar. É uma decisão de risco da operação, não um erro do cheque.',
    oQueFazer: [
      'Confirme se a sua operação aceita cheque ao portador.',
      'Se o nominal existir e nós não lemos, corrija aqui.',
    ],
  }),

  confianca_baixa: (a) => ({
    oQue: `A IA leu estes campos sem certeza: ${texto(a, 'campos')}.`,
    porQue:
      'Não quer dizer que está errado — quer dizer que ela mesma avisou que ficou em dúvida. É melhor uma dúvida declarada que um chute silencioso.',
    oQueFazer: [
      'Amplie a foto e confira só esses campos.',
      'Se algum estiver errado, corrija.',
    ],
  }),

  campos_nao_lidos: (a) => ({
    oQue: `O sistema não conseguiu ler: ${texto(a, 'campos')}.`,
    porQue: 'Onde não deu para ler aparece um ? vermelho na tela, em vez de um número inventado.',
    oQueFazer: [
      'Amplie a foto do cheque.',
      'Clique em "Corrigir" e digite o que você vê.',
      'O ? some assim que você salvar.',
    ],
  }),

  data_emissao_ausente: () => ({
    oQue: 'O campo da data do cheque está em branco.',
    porQue: 'Cheque sem data o banco devolve.',
    oQueFazer: [
      'Amplie a foto e confirme que o campo está vazio mesmo.',
      'Se estiver, peça ao cliente para preencher e assinar a alteração.',
    ],
  }),

  valor_extenso_parcial: () => ({
    oQue: 'Uma parte da frase do valor por extenso não deu para ler.',
    porQue:
      'Sem a frase inteira não dá para comparar com o valor em números — e comparar pela metade daria alarme falso.',
    oQueFazer: [
      'Amplie a foto e leia a linha do extenso.',
      'Complete em "Corrigir": a comparação roda sozinha ao salvar.',
    ],
  }),

  foto_baixa_qualidade: () => ({
    oQue: 'Este cheque foi lido de uma foto abaixo da resolução recomendada.',
    porQue:
      'Foto pequena não tem os pixels dos números pequenos — principalmente o CMC7. A leitura pode estar certa, mas a chance de erro é bem maior que o normal.',
    oQueFazer: [
      'Confira campo por campo antes de lançar este cheque.',
      'Se puder, refotografe: 1 cheque por foto, preenchendo a tela, com boa luz.',
    ],
  }),
}

/**
 * Alertas de CMC7 têm o número do bloco no código (`cmc7_bloco2_dv_invalido`),
 * mas a explicação é a mesma para os três grupos.
 */
function chaveDoCatalogo(codigo: string): string {
  const cmc7 = codigo.match(/^cmc7_bloco[123]_(.+)$/)
  if (cmc7) return cmc7[1]
  const data = codigo.match(/^(data_emissao|bom_para)_(passado|futuro)_distante$/)
  if (data) return 'data_suspeita'
  return codigo
}

const DATA_SUSPEITA: Construtor = () => ({
  oQue: 'A data lida está a mais de 12 meses daqui — para trás ou para frente.',
  porQue:
    'Cheque assim existe, mas é raro. Quase sempre é o ano que foi lido errado (26 virou 20, por exemplo), e uma data errada joga o cheque para o lugar errado na fila de vencimentos.',
  oQueFazer: ['Amplie a foto e confira o ano.', 'Corrija se estiver errado.'],
})

export function explicarAlerta(alerta: Alerta): Explicacao | null {
  const chave = chaveDoCatalogo(alerta.codigo)
  if (chave === 'data_suspeita') return DATA_SUSPEITA(alerta)
  const construtor = CATALOGO[chave]
  return construtor ? construtor(alerta) : null
}

export function temExplicacao(alerta: Alerta): boolean {
  return explicarAlerta(alerta) !== null
}
