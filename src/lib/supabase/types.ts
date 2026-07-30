/**
 * Tipos do banco escritos à mão (o schema é pequeno e estável).
 * Para regenerar a partir do projeto real:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
 *
 * Nota: aqui é `type`, não `interface`. O supabase-js exige que cada tabela
 * satisfaça `Record<string, unknown>`, e só alias de tipo objeto recebe index
 * signature implícita — com `interface` o cliente tipado degrada para `never`
 * e todo `.insert()`/`.select()` para de compilar.
 */

import type { Alerta, DigitoDuvidoso, StatusCheque, SugestaoCmc7 } from '../validation/types'

export type ChequeRow = {
  id: string
  batch_id: string
  owner_id: string
  org_id: string | null
  storage_path: string | null
  emitente: string | null
  emitente_normalizado: string | null
  banco_codigo: string | null
  banco_nome: string | null
  agencia: string | null
  conta: string | null
  numero_cheque: string | null
  cmc7_bloco1: string | null
  cmc7_bloco2: string | null
  cmc7_bloco3: string | null
  cmc7_completo: string | null
  digitos_duvidosos: DigitoDuvidoso[]
  cmc7_sugestoes: SugestaoCmc7[]
  valor_numerico: number | null
  valor_extenso_texto: string | null
  valor_extenso_convertido: number | null
  data_emissao: string | null
  bom_para: string | null
  data_efetiva: string | null
  nominal: string | null
  cidade: string | null
  assinatura_presente: boolean | null
  rasuras: string[]
  confianca: Record<string, string>
  observacoes: string | null
  status: StatusCheque
  alertas: Alerta[]
  lancado: boolean
  created_at: string
}

export type BatchRow = {
  id: string
  owner_id: string
  org_id: string | null
  nome: string | null
  total_valor: number
  total_cheques: number
  created_at: string
}

export type ProfileRow = {
  id: string
  email: string | null
  nome: string | null
  org_id: string | null
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: Partial<ProfileRow> & { id: string }
        Update: Partial<ProfileRow>
        Relationships: []
      }
      batches: {
        Row: BatchRow
        Insert: Partial<BatchRow> & { owner_id: string }
        Update: Partial<BatchRow>
        Relationships: []
      }
      cheques: {
        Row: ChequeRow
        Insert: Partial<ChequeRow> & { batch_id: string; owner_id: string }
        Update: Partial<ChequeRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
