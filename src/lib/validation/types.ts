/**
 * Tipos compartilhados entre a extração (modelo de visão) e a validação
 * determinística (código puro).
 *
 * Regra de ouro do produto: o modelo só EXTRAI. Tudo o que vira alerta na tela
 * é decidido aqui, em código testável.
 */

export type Confianca = 'alta' | 'media' | 'baixa'

/** Um dígito que o modelo não conseguiu ler com certeza. */
export interface DigitoDuvidoso {
  /** 1, 2 ou 3 — qual bloco do CMC7. */
  bloco: 1 | 2 | 3
  /** Posição do dígito dentro do bloco, 1-indexada, da esquerda para a direita. */
  posicao: number
  /** Leituras possíveis, ex. ["3", "8"]. */
  alternativas: string[]
}

export interface Cmc7Extraido {
  bloco1: string | null
  bloco2: string | null
  bloco3: string | null
  digitos_duvidosos: DigitoDuvidoso[]
}

/** Exatamente o que o modelo de visão devolve por cheque. */
export interface ChequeExtraido {
  banco_codigo: string | null
  banco_nome: string | null
  agencia: string | null
  conta: string | null
  numero_cheque: string | null
  cmc7: Cmc7Extraido
  valor_numerico: number | null
  valor_extenso_texto: string | null
  data_emissao: string | null
  bom_para_anotado: string | null
  nominal: string | null
  emitente: string | null
  cidade_praca: string | null
  assinatura_presente: boolean
  rasuras_detectadas: string[]
  confianca_por_campo: Record<string, Confianca>
  observacoes: string | null
}

export type NivelAlerta = 'vermelho' | 'amarelo'

export interface Alerta {
  nivel: NivelAlerta
  /** Código estável, para teste e para agrupar no painel. */
  codigo: string
  titulo: string
  detalhe: string
  /** Campo do cheque que o alerta aponta (para destacar na linha). */
  campo?: string
}

export type StatusCheque = 'ok' | 'conferir' | 'vermelho'

/** Uma correção de CMC7 cujo dígito verificador fecha. */
export interface SugestaoCmc7 {
  bloco: 1 | 2 | 3
  posicao: number
  /** O dígito que faz o DV fechar. */
  digito: string
  /** As alternativas que o modelo cogitou e que NÃO fecham. */
  descartados: string[]
  /** Bloco completo com a sugestão aplicada. */
  bloco_corrigido: string
}

export interface ResultadoValidacao {
  status: StatusCheque
  alertas: Alerta[]
  /** Valor obtido do extenso pelo parser (null = não interpretável). */
  valor_extenso_convertido: number | null
  /** Correções de CMC7 que fecham o DV. */
  cmc7_sugestoes: SugestaoCmc7[]
  /** Data que manda na ordenação: bom_para se válido, senão emissão. */
  data_efetiva: string | null
}
