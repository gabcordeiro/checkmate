import Link from 'next/link'
import { redirect } from 'next/navigation'
import UploadLote from '@/components/UploadLote'
import { criarClienteServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Novo lote — Cheque Mate' }

export default async function NovoLotePage() {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/lotes" className="text-xs text-slate-500 hover:text-slate-900">
        ← Lotes
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Novo lote</h1>
      <p className="mt-1 text-sm text-slate-600">
        Cada foto é lida separadamente. Foto com vários cheques empilhados funciona, mas a
        confiança da leitura cai — o app avisa quando isso acontece.
      </p>

      <div className="mt-6">
        <UploadLote usuarioId={user.id} />
      </div>
    </main>
  )
}
