/**
 * Schema da extração.
 *
 * Fonte única de verdade: escrito em JSON Schema e convertido para o dialeto do
 * Gemini quando necessário. O modelo é obrigado a responder NESTE formato —
 * nunca fazemos parsing de texto livre.
 */

export interface JsonSchema {
  type: string | string[]
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: string[]
  additionalProperties?: boolean
}

const digitoDuvidoso: JsonSchema = {
  type: 'object',
  description: 'Um dígito do CMC7 que não deu para ler com certeza.',
  properties: {
    bloco: { type: 'integer', description: '1, 2 ou 3 — qual bloco do CMC7.' },
    posicao: {
      type: 'integer',
      description: 'Posição do dígito dentro do bloco, contando da esquerda, começando em 1.',
    },
    alternativas: {
      type: 'array',
      description: 'Leituras possíveis para esse dígito, ex ["3","8"]. Sempre 2 ou mais.',
      items: { type: 'string' },
    },
  },
  required: ['bloco', 'posicao', 'alternativas'],
  additionalProperties: false,
}

const confiancaCampo: JsonSchema = {
  type: 'object',
  properties: {
    campo: {
      type: 'string',
      description: 'Nome do campo, ex "valor_numerico", "data_emissao", "cmc7".',
    },
    nivel: { type: 'string', enum: ['alta', 'media', 'baixa'] },
  },
  required: ['campo', 'nivel'],
  additionalProperties: false,
}

const cheque: JsonSchema = {
  type: 'object',
  properties: {
    banco_codigo: { type: ['string', 'null'], description: 'Código de compensação, ex "748".' },
    banco_nome: { type: ['string', 'null'] },
    agencia: { type: ['string', 'null'] },
    conta: { type: ['string', 'null'] },
    numero_cheque: { type: ['string', 'null'], description: 'Número impresso do cheque.' },
    cmc7: {
      type: 'object',
      properties: {
        bloco1: {
          type: ['string', 'null'],
          description: 'Bloco 1 da tarja CMC7: 8 dígitos (banco + agência + DV).',
        },
        bloco2: {
          type: ['string', 'null'],
          description: 'Bloco 2 da tarja CMC7: 12 dígitos (inclui o número do cheque + DV).',
        },
        bloco3: {
          type: ['string', 'null'],
          description: 'Bloco 3 da tarja CMC7: 10 dígitos (conta + DV).',
        },
        digitos_duvidosos: { type: 'array', items: digitoDuvidoso },
      },
      required: ['bloco1', 'bloco2', 'bloco3', 'digitos_duvidosos'],
      additionalProperties: false,
    },
    valor_numerico: {
      type: ['number', 'null'],
      description: 'Valor em algarismos, em reais. Ex: 1842.50',
    },
    valor_extenso_texto: {
      type: ['string', 'null'],
      description: 'Transcrição LITERAL do manuscrito por extenso, com os erros de grafia do emitente.',
    },
    data_emissao: { type: ['string', 'null'], description: 'Data escrita no cheque, YYYY-MM-DD.' },
    bom_para_anotado: {
      type: ['string', 'null'],
      description: 'Anotação "bom p/" fora dos campos oficiais, YYYY-MM-DD. null se não existir.',
    },
    nominal: { type: ['string', 'null'], description: 'A quem o cheque é nominal.' },
    emitente: {
      type: ['string', 'null'],
      description: 'Nome do titular/emitente impresso ou assinado no cheque.',
    },
    cidade_praca: { type: ['string', 'null'] },
    assinatura_presente: { type: 'boolean' },
    rasuras_detectadas: {
      type: 'array',
      description: 'Ex: ["data rasurada", "nominal com corretivo"]. Vazio se não houver.',
      items: { type: 'string' },
    },
    confianca_por_campo: { type: 'array', items: confiancaCampo },
    observacoes: { type: ['string', 'null'] },
  },
  required: [
    'banco_codigo',
    'banco_nome',
    'agencia',
    'conta',
    'numero_cheque',
    'cmc7',
    'valor_numerico',
    'valor_extenso_texto',
    'data_emissao',
    'bom_para_anotado',
    'nominal',
    'emitente',
    'cidade_praca',
    'assinatura_presente',
    'rasuras_detectadas',
    'confianca_por_campo',
    'observacoes',
  ],
  additionalProperties: false,
}

export const SCHEMA_EXTRACAO: JsonSchema = {
  type: 'object',
  properties: {
    cheques: {
      type: 'array',
      description: 'Um item por cheque visível na imagem, na ordem de cima para baixo.',
      items: cheque,
    },
  },
  required: ['cheques'],
  additionalProperties: false,
}

// ---------------------------------------------------------------------------
// Conversão para o dialeto do Gemini (subset do OpenAPI 3: tipos em CAIXA
// ALTA, null via `nullable`, sem `additionalProperties`).
// ---------------------------------------------------------------------------

interface GeminiSchema {
  type: string
  nullable?: boolean
  description?: string
  properties?: Record<string, GeminiSchema>
  required?: string[]
  items?: GeminiSchema
  enum?: string[]
}

export function paraGemini(schema: JsonSchema): GeminiSchema {
  const tipos = Array.isArray(schema.type) ? schema.type : [schema.type]
  const nullable = tipos.includes('null')
  const tipo = tipos.find((t) => t !== 'null') ?? 'string'

  const convertido: GeminiSchema = { type: tipo.toUpperCase() }
  if (nullable) convertido.nullable = true
  if (schema.description) convertido.description = schema.description
  if (schema.enum) convertido.enum = schema.enum
  if (schema.items) convertido.items = paraGemini(schema.items)
  if (schema.properties) {
    convertido.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([chave, valor]) => [chave, paraGemini(valor)]),
    )
  }
  if (schema.required) convertido.required = schema.required
  return convertido
}
