/**
 * Parser de valor por extenso (pt-BR) → número.
 *
 * Existe por um motivo só: pela Lei do Cheque (Lei 7.357/85, art. 12), quando o
 * valor em algarismos divergir do valor por extenso, VALE O EXTENSO — e o banco
 * devolve o cheque. Como a securitizadora paga a operação antes da compensação,
 * essa divergência é prejuízo direto.
 *
 * O parser é tolerante de propósito: cheque é manuscrito, e a transcrição do
 * modelo de visão vem com erros de grafia ("quatrossentos", "cincoenta",
 * "hum mil"). Preferimos interpretar e comparar a desistir.
 */

export interface ResultadoExtenso {
  /** Valor final em reais, ou null se nada foi reconhecido. */
  valor: number | null
  reais: number
  centavos: number
  /** true = reconhecemos ao menos um numeral. */
  interpretado: boolean
  /** Palavras que não são numeral nem conectivo conhecido. */
  palavrasIgnoradas: string[]
}

const UNIDADES: Record<string, number> = {
  zero: 0,
  um: 1,
  hum: 1,
  uma: 1,
  huma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezeseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezesete: 17,
  dezassete: 17,
  dezoito: 18,
  dezenove: 19,
  desenove: 19,
  dezanove: 19,
}

const DEZENAS: Record<string, number> = {
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  cincoenta: 50,
  cinqoenta: 50,
  sessenta: 60,
  secenta: 60,
  setenta: 70,
  cetenta: 70,
  oitenta: 80,
  noventa: 90,
}

const CENTENAS: Record<string, number> = {
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  dusentos: 200,
  dusentas: 200,
  trezentos: 300,
  trezentas: 300,
  tresentos: 300,
  tresentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quatrosentos: 400,
  quatrossentos: 400,
  quinhentos: 500,
  quinhentas: 500,
  quinhetos: 500,
  seiscentos: 600,
  seiscentas: 600,
  seissentos: 600,
  seicentos: 600,
  setecentos: 700,
  setecentas: 700,
  setessentos: 700,
  oitocentos: 800,
  oitocentas: 800,
  oitossentos: 800,
  novecentos: 900,
  novecentas: 900,
  novessentos: 900,
}

/** Multiplicadores. Ordem importa: fecham o grupo acumulado à esquerda. */
const ESCALAS: Record<string, number> = {
  mil: 1_000,
  mill: 1_000,
  milhao: 1_000_000,
  milhoes: 1_000_000,
  milhoens: 1_000_000,
  milhoins: 1_000_000,
  bilhao: 1_000_000_000,
  bilhoes: 1_000_000_000,
}

/** Palavras que aparecem no extenso e não somam nada. */
const CONECTIVOS = new Set([
  'e',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'reais',
  'real',
  'r',
  'rs',
  'apenas',
  'somente',
  'valor',
  'quantia',
  'importancia',
  'liquido',
  'so',
])

const CENTAVOS_WORDS = new Set(['centavo', 'centavos', 'cts', 'ctvs'])
const REAIS_WORDS = new Set(['reais', 'real'])

/** minúsculas, sem acento, sem pontuação, hífen vira espaço. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // marcas de acento soltas pelo NFD
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/[^a-z0-9/ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface ComposicaoResultado {
  valor: number
  reconheceuAlgo: boolean
  desconhecidas: string[]
}

/**
 * Soma um trecho já tokenizado. Português é aditivo dentro de cada grupo
 * ("oitocentos e quarenta e dois" = 842) e multiplicativo nas escalas
 * ("duzentos mil" = 200 × 1000), então acumulamos o grupo corrente e
 * despachamos para o total sempre que uma escala aparece.
 */
function comporValor(tokens: string[]): ComposicaoResultado {
  let total = 0
  let grupo = 0
  let reconheceuAlgo = false
  const desconhecidas: string[] = []

  for (const token of tokens) {
    if (!token) continue

    // "42/100" — jeito comum de escrever centavos no cheque.
    const fracao = token.match(/^(\d{1,2})\/100$/)
    if (fracao) {
      reconheceuAlgo = true
      continue // tratado fora, na separação de centavos
    }

    if (/^\d+$/.test(token)) {
      grupo += Number(token)
      reconheceuAlgo = true
      continue
    }

    const escala = ESCALAS[token]
    if (escala !== undefined) {
      // "mil" sozinho vale 1000; "duzentos mil" vale 200 × 1000.
      total += (grupo === 0 ? 1 : grupo) * escala
      grupo = 0
      reconheceuAlgo = true
      continue
    }

    const valorSimples = CENTENAS[token] ?? DEZENAS[token] ?? UNIDADES[token]
    if (valorSimples !== undefined) {
      grupo += valorSimples
      reconheceuAlgo = true
      continue
    }

    if (CONECTIVOS.has(token) || CENTAVOS_WORDS.has(token)) continue

    desconhecidas.push(token)
  }

  return { valor: total + grupo, reconheceuAlgo, desconhecidas }
}

function ultimoIndice(tokens: string[], predicado: (t: string) => boolean): number {
  for (let i = tokens.length - 1; i >= 0; i -= 1) if (predicado(tokens[i])) return i
  return -1
}

/**
 * Converte o extenso manuscrito em número.
 *
 * Separação reais/centavos, em ordem de preferência:
 *  1. "... reais e ... centavos"  → marcador explícito dos dois lados
 *  2. "... reais e quarenta e dois" → o que vem depois de "reais" e vale ≤ 99
 *  3. "42/100"                    → fração de centavos
 *  4. "... e cinquenta centavos"  → sem "reais": corta no último "e" se o
 *     trecho final couber em centavos (≤ 99)
 */
export function parseExtenso(texto: string | null | undefined): ResultadoExtenso {
  const vazio: ResultadoExtenso = {
    valor: null,
    reais: 0,
    centavos: 0,
    interpretado: false,
    palavrasIgnoradas: [],
  }
  if (!texto || !texto.trim()) return vazio

  const normalizado = normalizarTexto(texto)
  if (!normalizado) return vazio

  const tokens = normalizado.split(' ').filter(Boolean)

  // Fração "42/100" em qualquer posição.
  let centavosDaFracao: number | null = null
  for (const token of tokens) {
    const m = token.match(/^(\d{1,2})\/100$/)
    if (m) centavosDaFracao = Number(m[1])
  }

  const idxReais = tokens.findIndex((t) => REAIS_WORDS.has(t))
  const idxCentavos = ultimoIndice(tokens, (t) => CENTAVOS_WORDS.has(t))

  let tokensReais: string[]
  let tokensCentavos: string[] = []

  if (idxReais >= 0 && idxCentavos > idxReais) {
    tokensReais = tokens.slice(0, idxReais)
    tokensCentavos = tokens.slice(idxReais + 1, idxCentavos)
  } else if (idxReais >= 0) {
    tokensReais = tokens.slice(0, idxReais)
    const cauda = tokens.slice(idxReais + 1)
    const parsedCauda = comporValor(cauda)
    if (parsedCauda.reconheceuAlgo && parsedCauda.valor > 0 && parsedCauda.valor <= 99) {
      tokensCentavos = cauda
    }
  } else if (idxCentavos >= 0) {
    const antes = tokens.slice(0, idxCentavos)
    const parsedTodo = comporValor(antes)

    if (parsedTodo.reconheceuAlgo && parsedTodo.valor <= 99) {
      // Cabe inteiro em centavos: "noventa e nove centavos" = R$ 0,99.
      tokensReais = []
      tokensCentavos = antes
    } else {
      // Passa de 99, então tem parte em reais: "quinhentos e cinquenta
      // centavos" = R$ 500,50. Corta no último "e" e confere se a cauda cabe
      // em centavos.
      const idxUltimoE = ultimoIndice(antes, (t) => t === 'e')
      const cauda = idxUltimoE >= 0 ? antes.slice(idxUltimoE + 1) : []
      const cabeca = idxUltimoE >= 0 ? antes.slice(0, idxUltimoE) : []
      const parsedCauda = comporValor(cauda)
      const parsedCabeca = comporValor(cabeca)
      if (
        idxUltimoE >= 0 &&
        parsedCauda.reconheceuAlgo &&
        parsedCauda.valor > 0 &&
        parsedCauda.valor <= 99 &&
        parsedCabeca.reconheceuAlgo &&
        parsedCabeca.valor >= 1
      ) {
        tokensReais = cabeca
        tokensCentavos = cauda
      } else {
        tokensReais = antes
      }
    }
  } else {
    tokensReais = tokens
  }

  const parsedReais = comporValor(tokensReais)
  const parsedCentavos = tokensCentavos.length ? comporValor(tokensCentavos) : null

  let centavos = parsedCentavos?.reconheceuAlgo ? parsedCentavos.valor : 0
  if (centavosDaFracao !== null && centavos === 0) centavos = centavosDaFracao
  if (centavos > 99) centavos = centavos % 100

  const reconheceuAlgo = parsedReais.reconheceuAlgo || (parsedCentavos?.reconheceuAlgo ?? false)
  if (!reconheceuAlgo) {
    return { ...vazio, palavrasIgnoradas: parsedReais.desconhecidas }
  }

  const reais = parsedReais.valor
  const valor = Math.round((reais + centavos / 100) * 100) / 100

  return {
    valor,
    reais,
    centavos,
    interpretado: true,
    palavrasIgnoradas: [
      ...parsedReais.desconhecidas,
      ...(parsedCentavos?.desconhecidas ?? []),
    ],
  }
}
