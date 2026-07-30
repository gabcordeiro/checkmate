/**
 * Chamada do modelo de visão.
 *
 * Mesmo padrão do MatchCV: `fetch` puro (sem SDK), chave de API só no servidor,
 * saída estruturada. A diferença é que aqui o modelo precisa VER a imagem, e o
 * modelo de texto do MatchCV (llama-3.3-70b) não tem visão — por isso o padrão
 * é Gemini, com Groq (llama-4-scout, que tem visão) como alternativa.
 *
 * Este arquivo NUNCA deve ser importado por componente client: ele lê
 * process.env.GEMINI_API_KEY / GROQ_API_KEY.
 */

import type { ChequeExtraido, Confianca, DigitoDuvidoso } from '../validation/types'
import { PROMPT_EXTRACAO } from './prompt'
import { paraGemini, SCHEMA_EXTRACAO } from './schema'

export type Provedor = 'gemini' | 'groq'

export interface ImagemParaExtracao {
  /** Conteúdo da imagem em base64, sem o prefixo `data:`. */
  base64: string
  mimeType: string
}

export class ErroVisao extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message)
    this.name = 'ErroVisao'
  }
}

export function provedorConfigurado(): Provedor {
  const escolhido = (process.env.VISION_PROVIDER ?? '').toLowerCase()
  if (escolhido === 'groq') return 'groq'
  if (escolhido === 'gemini') return 'gemini'
  // Sem escolha explícita: quem tiver chave.
  if (process.env.GEMINI_API_KEY) return 'gemini'
  if (process.env.GROQ_API_KEY) return 'groq'
  return 'gemini'
}

// ---------------------------------------------------------------------------
// Normalização: o modelo pode omitir campo, trocar tipo ou devolver string onde
// esperamos número. Nada disso pode virar exceção em produção.
// ---------------------------------------------------------------------------

function texto(valor: unknown): string | null {
  if (typeof valor === 'string') {
    const limpo = valor.trim()
    return limpo && limpo.toLowerCase() !== 'null' ? limpo : null
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  return null
}

function digitos(valor: unknown): string | null {
  const t = texto(valor)
  if (!t) return null
  const somente = t.replace(/\D/g, '')
  return somente || null
}

function numero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string') {
    // Aceita "1.842,50" e "1842.50".
    const limpo = valor
      .replace(/[R$\s]/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.')
    const n = Number(limpo)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function dataIso(valor: unknown): string | null {
  const t = texto(valor)
  if (!t) return null
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  }
  // Rede de segurança: o modelo às vezes devolve DD/MM/AAAA apesar do schema.
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3]
    return `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  }
  return null
}

function listaDeTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  return valor.map((v) => texto(v)).filter((v): v is string => Boolean(v))
}

function normalizarDuvidosos(valor: unknown): DigitoDuvidoso[] {
  if (!Array.isArray(valor)) return []
  const saida: DigitoDuvidoso[] = []
  for (const item of valor) {
    if (!item || typeof item !== 'object') continue
    const bruto = item as Record<string, unknown>
    const bloco = Number(bruto.bloco)
    const posicao = Number(bruto.posicao)
    if (![1, 2, 3].includes(bloco) || !Number.isInteger(posicao) || posicao < 1) continue
    const alternativas = Array.from(
      new Set(
        listaDeTextos(bruto.alternativas)
          .map((a) => a.replace(/\D/g, ''))
          .filter((a) => a.length === 1),
      ),
    )
    if (alternativas.length === 0) continue
    saida.push({ bloco: bloco as 1 | 2 | 3, posicao, alternativas })
  }
  return saida
}

function normalizarConfianca(valor: unknown): Record<string, Confianca> {
  const saida: Record<string, Confianca> = {}
  const niveis: Confianca[] = ['alta', 'media', 'baixa']

  // Formato do schema: [{campo, nivel}].
  if (Array.isArray(valor)) {
    for (const item of valor) {
      if (!item || typeof item !== 'object') continue
      const bruto = item as Record<string, unknown>
      const campo = texto(bruto.campo)
      const nivel = texto(bruto.nivel)?.toLowerCase() as Confianca | undefined
      if (campo && nivel && niveis.includes(nivel)) saida[campo] = nivel
    }
    return saida
  }

  // Tolerância: alguns modelos devolvem um objeto {campo: nivel}.
  if (valor && typeof valor === 'object') {
    for (const [campo, nivel] of Object.entries(valor as Record<string, unknown>)) {
      const n = texto(nivel)?.toLowerCase() as Confianca | undefined
      if (n && niveis.includes(n)) saida[campo] = n
    }
  }
  return saida
}

export function normalizarChequeExtraido(bruto: unknown): ChequeExtraido {
  const c = (bruto ?? {}) as Record<string, unknown>
  const cmc7 = (c.cmc7 ?? {}) as Record<string, unknown>

  return {
    banco_codigo: digitos(c.banco_codigo),
    banco_nome: texto(c.banco_nome),
    agencia: digitos(c.agencia),
    conta: digitos(c.conta),
    numero_cheque: digitos(c.numero_cheque),
    cmc7: {
      bloco1: digitos(cmc7.bloco1),
      bloco2: digitos(cmc7.bloco2),
      bloco3: digitos(cmc7.bloco3),
      digitos_duvidosos: normalizarDuvidosos(cmc7.digitos_duvidosos),
    },
    valor_numerico: numero(c.valor_numerico),
    valor_extenso_texto: texto(c.valor_extenso_texto),
    data_emissao: dataIso(c.data_emissao),
    bom_para_anotado: dataIso(c.bom_para_anotado),
    nominal: texto(c.nominal),
    emitente: texto(c.emitente),
    cidade_praca: texto(c.cidade_praca),
    // Só é `true` se o modelo afirmou true. Ausência conta como "não vi".
    assinatura_presente: c.assinatura_presente === true,
    rasuras_detectadas: listaDeTextos(c.rasuras_detectadas),
    confianca_por_campo: normalizarConfianca(c.confianca_por_campo),
    observacoes: texto(c.observacoes),
  }
}

function extrairListaDeCheques(payload: unknown): ChequeExtraido[] {
  const raiz = (payload ?? {}) as Record<string, unknown>
  const lista = Array.isArray(raiz.cheques) ? raiz.cheques : []
  return lista.map(normalizarChequeExtraido)
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

async function chamarGemini(imagem: ImagemParaExtracao): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new ErroVisao('GEMINI_API_KEY não configurada no servidor.', 500)

  const modelo = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`

  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: PROMPT_EXTRACAO },
            { inline_data: { mime_type: imagem.mimeType, data: imagem.base64 } },
          ],
        },
      ],
      generationConfig: {
        // Leitura de dígito não é tarefa criativa.
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: paraGemini(SCHEMA_EXTRACAO),
      },
    }),
  })

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '')
    throw new ErroVisao(`Gemini respondeu ${resposta.status}. ${detalhe.slice(0, 400)}`)
  }

  const corpo = (await resposta.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const texto = corpo.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!texto.trim()) throw new ErroVisao('Gemini devolveu resposta vazia.')

  try {
    return JSON.parse(texto)
  } catch {
    throw new ErroVisao('Gemini devolveu um JSON inválido.')
  }
}

// ---------------------------------------------------------------------------
// Groq (OpenAI-compatible, igual à rota do MatchCV mas com modelo de visão)
// ---------------------------------------------------------------------------

async function chamarGroq(imagem: ImagemParaExtracao): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new ErroVisao('GROQ_API_KEY não configurada no servidor.', 500)

  const modelo = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'

  const resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${PROMPT_EXTRACAO}\n\nResponda SOMENTE com um JSON válido neste schema:\n${JSON.stringify(
                SCHEMA_EXTRACAO,
              )}`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:${imagem.mimeType};base64,${imagem.base64}` },
            },
          ],
        },
      ],
    }),
  })

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '')
    throw new ErroVisao(`Groq respondeu ${resposta.status}. ${detalhe.slice(0, 400)}`)
  }

  const corpo = (await resposta.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const conteudo = corpo.choices?.[0]?.message?.content ?? ''
  if (!conteudo.trim()) throw new ErroVisao('Groq devolveu resposta vazia.')

  try {
    return JSON.parse(conteudo)
  } catch {
    throw new ErroVisao('Groq devolveu um JSON inválido.')
  }
}

/** Lê todos os cheques de UMA imagem. */
export async function extrairChequesDaImagem(
  imagem: ImagemParaExtracao,
): Promise<ChequeExtraido[]> {
  const provedor = provedorConfigurado()
  const payload = provedor === 'groq' ? await chamarGroq(imagem) : await chamarGemini(imagem)
  return extrairListaDeCheques(payload)
}
