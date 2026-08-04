/**
 * Tipos compartilhados entre a extração (modelo de visão) e a validação
 * determinística (código puro).
 *
 * Regra de ouro do produto: o modelo só EXTRAI. Tudo o que vira alerta na tela
 * é decidido aqui, em código testável.
 */

export type Confianca = 'alta' | 'media' | 'baixa'

/**
 * Campos tipados (valor, datas) que o modelo NÃO CONSEGUIU LER.
 *
 * Não confundir com o campo vir `null`: `bom_para_anotado: null` pode ser "o
 * cheque não tem essa anotação" ou "não consegui ler". Só o segundo vira `?`
 * vermelho na tela. Em campos de texto a marca vai inline, no próprio valor
 * ("0210?7369"), porque ali a lacuna é de um caractere e não do campo inteiro.
 */
export type CampoNaoLido =
  | 'valor_numerico'
  | 'data_emissao'
  | 'bom_para_anotado'
  | 'nominal'
  | 'emitente'
  | 'banco_codigo'
  | 'agencia'
  | 'conta'
  | 'numero_cheque'
  | 'valor_extenso_texto'

/**
 * Um dígito que o modelo LEU mas não tem certeza de qual é — "pode ser 3 ou 8".
 * Diferente do `?`, que é "não consegui ler".
 */
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
  /** Campos tipados que o modelo não conseguiu ler (viram `?` na tela). */
  nao_lidos: CampoNaoLido[]
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
  /**
   * Os números por trás do alerta, separados do texto.
   *
   * A tela de explicação monta o exemplo visual com eles ("na foto está 9, a
   * conta dá 8"), em vez de a operadora ter de extrair isso de uma frase. Foi
   * ler "Lido 9, calculado 8" e não entender que motivou esta separação.
   */
  dados?: Record<string, string | number>
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
