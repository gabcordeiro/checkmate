import Link from 'next/link'
import { redirect } from 'next/navigation'
import FormularioNovaSenha from '@/components/FormularioNovaSenha'
import Logo from '@/components/Logo'
import { criarClienteServidor, supabaseConfiguradoServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Nova senha — Cheque Mate' }

// Página autenticada: nunca pode ser pré-renderizada em build.
export const dynamic = 'force-dynamic'

/**
 * Chegada do link de recuperação: `/auth/callback` já trocou o código pela
 * sessão, então aqui a usuária está autenticada e só falta definir a senha.
 * Sem sessão não há o que fazer — volta para o login.
 */
export default async function NovaSenhaPage() {
  if (!supabaseConfiguradoServidor) redirect('/login')

  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(
      '/login?erro=' + encodeURIComponent('Este link expirou ou já foi usado. Peça um novo.'),
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <div className="t-reveal cartao-destaque p-7 sm:p-8">
        <Logo tamanho={38} comNome />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Definir senha</h1>
        <p className="mt-1.5 text-sm text-tinta-600">
          Escolha uma senha nova. Depois dela salva, você entra direto.
        </p>

        <FormularioNovaSenha email={user.email ?? null} />
      </div>

      <p className="t-reveal t-reveal-2 mt-5 text-center text-sm">
        <Link href="/lotes" className="text-tinta-500 transition-colors hover:text-marca-700">
          ← Voltar para os lotes
        </Link>
      </p>
    </main>
  )
}
