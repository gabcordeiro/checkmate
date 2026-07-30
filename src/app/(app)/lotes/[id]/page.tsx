import Link from 'next/link'
import { notFound } from 'next/navigation'
import BotaoExportarPdf from '@/components/BotaoExportarPdf'
import PainelAnalise from '@/components/PainelAnalise'
import TabelaLote from '@/components/TabelaLote'
import { analisarLote } from '@/lib/analise'
import { carregarLote, nomeDoLote } from '@/lib/carregarLote'
import { formatarDataBr } from '@/lib/validation/datas'

export default async function LotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lote = await carregarLote(id)
  if (!lote) notFound()

  const { batch, cheques, chequesComFoto, erro } = lote
  const analise = analisarLote(cheques)
  const pendentes = analise.resumo.quantidade - analise.resumo.lancados

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/lotes" className="text-xs text-tinta-500 hover:text-tinta-900">
        ← Lotes
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{nomeDoLote(batch)}</h1>
          <p className="text-xs text-tinta-500">
            Criado em {formatarDataBr(batch.created_at.slice(0, 10))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Ação principal: é daqui que sai o trabalho da operadora. */}
          {cheques.length > 0 && (
            <Link href={`/lotes/${batch.id}/conferir`} className="btn-primario px-3 py-1.5 text-xs">
              {pendentes > 0
                ? `Conferir ${pendentes} ${pendentes === 1 ? 'cheque' : 'cheques'}`
                : 'Revisar no modo conferência'}
            </Link>
          )}
          <a href={`/api/lotes/${batch.id}/csv`} className="btn-secundario px-3 py-1.5 text-xs">
            CSV
          </a>
          <BotaoExportarPdf cheques={cheques} nomeLote={batch.nome} criadoEm={batch.created_at} />
          <Link href="/lotes/novo" className="btn-secundario px-3 py-1.5 text-xs">
            Adicionar fotos
          </Link>
        </div>
      </div>

      {erro && (
        <p className="mt-4 rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2 text-sm text-devolve-text">
          Não foi possível carregar os cheques: {erro}
        </p>
      )}

      {cheques.length > 0 && (
        <div className="mt-5">
          <PainelAnalise analise={analise} />
        </div>
      )}

      <div className="mt-6">
        <TabelaLote cheques={chequesComFoto} />
      </div>

      <p className="mt-8 text-xs leading-relaxed text-tinta-500">
        O app confere; a decisão é sua. Cada alerta aponta o campo a olhar na foto — nenhum cheque
        é aprovado ou reprovado automaticamente, e você pode corrigir qualquer leitura errada
        (a validação roda de novo em cima da correção).
      </p>
    </main>
  )
}
