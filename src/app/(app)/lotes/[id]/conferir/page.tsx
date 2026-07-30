import Link from 'next/link'
import { notFound } from 'next/navigation'
import ModoConferencia from '@/components/ModoConferencia'
import { carregarLote, nomeDoLote } from '@/lib/carregarLote'

export const metadata = { title: 'Conferência — Cheque Mate' }

export default async function ConferirPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lote = await carregarLote(id)
  if (!lote) notFound()

  return (
    <main className="mx-auto max-w-5xl px-4 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/lotes/${id}`} className="text-xs text-slate-500 hover:text-slate-900">
          ← Voltar ao lote
        </Link>
        <h1 className="sr-only">Modo conferência</h1>
      </div>

      {lote.erro && (
        <p className="mt-3 rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2 text-sm text-devolve-text">
          Não foi possível carregar os cheques: {lote.erro}
        </p>
      )}

      <div className="mt-3">
        <ModoConferencia
          cheques={lote.chequesComFoto}
          loteId={id}
          nomeLote={nomeDoLote(lote.batch)}
        />
      </div>
    </main>
  )
}
