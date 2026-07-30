import { criarClienteServidor } from './supabase/server'
import type { BatchRow, ChequeRow } from './supabase/types'
import type { ChequeComFoto } from '@/components/TabelaLote'

/** Signed URL de 1h: dá para conferir o lote inteiro sem virar link público. */
const VALIDADE_URL_SEGUNDOS = 3600

export interface LoteCarregado {
  batch: BatchRow
  cheques: ChequeRow[]
  chequesComFoto: ChequeComFoto[]
  erro: string | null
}

/**
 * Carrega o lote com as fotos assinadas. Usado pela tela do lote e pelo modo
 * conferência — uma função só para as duas verem exatamente o mesmo estado.
 * RLS garante que só o dono encontra o lote; `null` = não existe para ela.
 */
export async function carregarLote(id: string): Promise<LoteCarregado | null> {
  const supabase = await criarClienteServidor()

  const { data: lote } = await supabase.from('batches').select('*').eq('id', id).maybeSingle()
  if (!lote) return null

  const { data: brutos, error } = await supabase
    .from('cheques')
    .select('*')
    .eq('batch_id', id)
    .order('created_at', { ascending: true })

  const cheques = (brutos ?? []) as ChequeRow[]

  // Uma chamada para todas as fotos do lote; o bucket é privado.
  const caminhos = [...new Set(cheques.map((c) => c.storage_path).filter((c): c is string => !!c))]
  const urlPorCaminho = new Map<string, string>()
  if (caminhos.length > 0) {
    const { data: assinadas } = await supabase.storage
      .from('cheques')
      .createSignedUrls(caminhos, VALIDADE_URL_SEGUNDOS)
    for (const item of assinadas ?? []) {
      if (item.path && item.signedUrl) urlPorCaminho.set(item.path, item.signedUrl)
    }
  }

  return {
    batch: lote as BatchRow,
    cheques,
    chequesComFoto: cheques.map((cheque) => ({
      ...cheque,
      urlAssinada: cheque.storage_path ? (urlPorCaminho.get(cheque.storage_path) ?? null) : null,
    })),
    erro: error?.message ?? null,
  }
}

export function nomeDoLote(batch: BatchRow): string {
  if (batch.nome?.trim()) return batch.nome.trim()
  const [ano, mes, dia] = batch.created_at.slice(0, 10).split('-')
  return `Lote de ${dia}/${mes}/${ano}`
}
