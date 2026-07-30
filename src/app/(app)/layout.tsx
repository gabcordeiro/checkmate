import Link from 'next/link'
import { redirect } from 'next/navigation'
import { criarClienteServidor, supabaseConfiguradoServidor } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfiguradoServidor) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16">
        <h1 className="text-xl font-semibold">Falta configurar o Supabase</h1>
        <p className="mt-2 text-sm text-slate-600">
          Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (ou, em projetos antigos,{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>) no ambiente — local em{' '}
          <code>.env.local</code>, produção nas Environment Variables da Vercel — e recarregue.
        </p>
      </main>
    )
  }

  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // O middleware já redireciona, mas a checagem aqui é a que realmente garante
  // que nenhum dado de lote seja renderizado sem sessão.
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/lotes" className="text-sm font-semibold tracking-tight">
            Cheque Mate
          </Link>
          <nav className="flex-1 text-sm">
            <Link href="/lotes" className="text-slate-600 hover:text-slate-900">
              Lotes
            </Link>
          </nav>
          <Link href="/lotes/novo" className="btn-primario px-3 py-1.5 text-xs">
            Novo lote
          </Link>
          <Link
            href="/nova-senha"
            className="hidden text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline sm:inline"
          >
            Senha
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
              title={user.email ?? undefined}
            >
              Sair
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  )
}
