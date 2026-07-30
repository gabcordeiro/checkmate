import Link from 'next/link'
import { redirect } from 'next/navigation'
import Logo from '@/components/Logo'
import { criarClienteServidor, supabaseConfiguradoServidor } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfiguradoServidor) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16">
        <div className="cartao-destaque p-6">
          <Logo tamanho={36} comNome />
          <h1 className="mt-5 text-xl font-semibold">Falta configurar o Supabase</h1>
          <p className="mt-2 text-sm leading-relaxed text-tinta-600">
            Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (ou, em projetos antigos,{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>) no ambiente — local em{' '}
            <code>.env.local</code>, produção nas Environment Variables da Vercel — e recarregue.
          </p>
        </div>
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
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:gap-4">
          <Link href="/lotes" className="rounded-xl">
            <Logo tamanho={30} comNome />
          </Link>

          <nav className="flex-1 pl-1 text-sm">
            <Link
              href="/lotes"
              className="rounded-lg px-2 py-1 text-tinta-600 transition-colors hover:bg-marca-50 hover:text-marca-700"
            >
              Lotes
            </Link>
          </nav>

          <Link href="/lotes/novo" className="btn-primario px-3 py-1.5 text-xs">
            Novo lote
          </Link>

          <Link
            href="/nova-senha"
            className="hidden text-xs text-tinta-500 transition-colors hover:text-marca-700 sm:inline"
          >
            Senha
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-xs text-tinta-500 transition-colors hover:text-marca-700"
              title={user.email ?? undefined}
            >
              Sair
            </button>
          </form>
        </div>
        {/* Fio de gradiente separando o cabeçalho do conteúdo. */}
        <span aria-hidden className="block h-px bg-marca-gradiente opacity-40" />
      </header>
      {children}
    </div>
  )
}
