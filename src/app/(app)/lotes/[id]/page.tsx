import Link from 'next/link'
import { notFound } from 'next/navigation'
import BotaoExportarPdf from '@/components/BotaoExportarPdf'
import PainelAlertas from '@/components/PainelAlertas'
import TabelaLote, { type ChequeComFoto } from '@/components/TabelaLote'
import { resumirLote } from '@/lib/lote'
import { criarClienteServidor } from '@/lib/supabase/server'
import { formatarDataBr } from '@/lib/validation/datas'
import type { BatchRow, ChequeRow } from '@/lib/supabase/types'

/** Signed URL de 1h: tempo de sobra para conferir um lote sem virar link público. */
const VALIDADE_URL_SEGUNDOS = 3600

export default async function LotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await criarClienteServidor()

  const { data: lote } = await supabase.from('batches').select('*').eq('id', id).maybeSingle()
  if (!lote) notFound()

  const { data: chequesBrutos, error } = await supabase
    .from('cheques')
    .select('*')
    .eq('batch_id', id)
    .order('created_at', { ascending: true })

  const cheques = (chequesBrutos ?? []) as ChequeRow[]

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

  const chequesComFoto: ChequeComFoto[] = cheques.map((cheque) => ({
    ...cheque,
    urlAssinada: cheque.storage_path ? urlPorCaminho.get(cheque.storage_path) ?? null : null,
  }))

  const resumo = resumirLote(cheques)
  const batch = lote as BatchRow

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/lotes" className="text-xs text-slate-500 hover:text-slate-900">
        ← Lotes
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {batch.nome?.trim() || `Lote de ${formatarDataBr(batch.created_at.slice(0, 10))}`}
          </h1>
          <p className="text-xs text-slate-500">
            Criado em {formatarDataBr(batch.created_at.slice(0, 10))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/lotes/${batch.id}/csv`} className="btn-secundario px-3 py-1.5 text-xs">
            Exportar CSV
          </a>
          <BotaoExportarPdf
            cheques={cheques}
            nomeLote={batch.nome}
            criadoEm={batch.created_at}
          />
          <Link href="/lotes/novo" className="btn-secundario px-3 py-1.5 text-xs">
            Adicionar fotos
          </Link>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2 text-sm text-devolve-text">
          Não foi possível carregar os cheques: {error.message}
        </p>
      )}

      <div className="mt-5 space-y-6">
        <PainelAlertas cheques={cheques} resumo={resumo} />
        <TabelaLote cheques={chequesComFoto} />
      </div>

      <p className="mt-8 text-xs leading-relaxed text-slate-500">
        O app confere; a decisão é sua. Cada alerta aponta o campo a olhar na foto — nenhum cheque
        é aprovado ou reprovado automaticamente.
      </p>
    </main>
  )
}
