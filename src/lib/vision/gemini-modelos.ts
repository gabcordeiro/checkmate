/**
 * Resolução do modelo do Gemini.
 *
 * O Google aposenta nome de modelo sem aviso — `gemini-2.5-flash` passou a
 * responder 404 ("no longer available to new users") de um dia para o outro e
 * derrubou a extração. Fixar um nome no código é garantir que isso repita.
 *
 * Então: tenta a lista de candidatos e, se todos derem 404, PERGUNTA à API quais
 * modelos aquela chave tem e escolhe o melhor. O resultado fica em memória do
 * processo, para não listar modelos a cada cheque.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Candidatos em ordem de preferência. Os apelidos `-latest` vêm primeiro
 * justamente porque o Google os mantém apontando para um modelo vivo.
 */
export const CANDIDATOS_PADRAO = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-lite-latest',
]

/** Modelos que não servem para ler cheque, por mais que suportem generateContent. */
const PROIBIDOS = /embedding|aqa|tts|image-generation|imagen|veo|live|native-audio|thinking/i

export interface ModeloDisponivel {
  nome: string
  metodos: string[]
}

let modeloResolvido: string | null = null
let listaEmCache: string[] | null = null

/** Zera o cache — usado nos testes. */
export function limparCacheDeModelo() {
  modeloResolvido = null
  listaEmCache = null
}

export function modeloEmCache(): string | null {
  return modeloResolvido
}

export function fixarModelo(nome: string) {
  modeloResolvido = nome
}

/**
 * Nota do modelo para leitura de cheque: quanto maior, melhor.
 * Flash é o ponto certo entre custo e qualidade de OCR; "lite" economiza mais
 * mas erra mais dígito, e dígito errado é o que a ferramenta existe para evitar.
 */
export function pontuarModelo(nome: string): number {
  if (PROIBIDOS.test(nome)) return -1

  let pontos = 0
  if (nome.includes('flash')) pontos += 100
  if (nome.includes('pro')) pontos += 60
  if (nome.includes('lite')) pontos -= 40
  if (nome.endsWith('-latest')) pontos += 25
  if (nome.includes('preview')) pontos -= 5
  if (nome.includes('exp')) pontos -= 10

  // Versão: 3 > 2.5 > 2.0 > 1.5
  const versao = nome.match(/gemini-(\d+(?:\.\d+)?)/)
  if (versao) pontos += Number(versao[1]) * 10

  return pontos
}

/** Lista os modelos que a chave alcança e que aceitam generateContent. */
export async function listarModelos(apiKey: string): Promise<string[]> {
  if (listaEmCache) return listaEmCache

  const resposta = await fetch(`${BASE}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
  })
  if (!resposta.ok) return []

  const corpo = (await resposta.json().catch(() => null)) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
  } | null

  const nomes = (corpo?.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter((n) => n.startsWith('gemini') && pontuarModelo(n) > 0)

  listaEmCache = nomes
  return nomes
}

/** Melhor modelo entre os disponíveis, ou null se nenhum servir. */
export function escolherMelhor(nomes: string[]): string | null {
  let melhor: string | null = null
  let melhorPontos = 0
  for (const nome of nomes) {
    const pontos = pontuarModelo(nome)
    if (pontos > melhorPontos) {
      melhorPontos = pontos
      melhor = nome
    }
  }
  return melhor
}

/**
 * Ordem de tentativa: o que está em cache, o que a env pediu, os candidatos
 * padrão. A descoberta pela API só entra quando todos derem 404.
 */
export function candidatos(modeloDaEnv?: string | null): string[] {
  const lista = [
    modeloResolvido,
    modeloDaEnv?.trim() || null,
    ...CANDIDATOS_PADRAO,
  ].filter((n): n is string => Boolean(n))
  return [...new Set(lista)]
}
