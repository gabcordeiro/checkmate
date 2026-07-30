import Link from 'next/link'
import { redirect } from 'next/navigation'
import FormularioNovaSenha from '@/components/FormularioNovaSenha'
import { criarClienteServidor, supabaseConfiguradoServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Nova senha — ChequeCerto' }

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
    redirect('/login?erro=' + encodeURIComponent('Este link expirou ou já foi usado. Peça um novo.'))
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        ChequeCerto
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Definir senha</h1>
      <p className="mt-2 text-sm text-slate-600">
        Escolha uma senha nova. Depois dela salva, você entra direto.
      </p>

      <FormularioNovaSenha email={user.email ?? null} />

      <p className="mt-6 text-sm">
        <Link href="/lotes" className="text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
          ← Voltar para os lotes
        </Link>
      </p>
    </main>
  )
}
