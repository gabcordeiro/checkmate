import { Suspense } from 'react'
import FormularioLogin from '@/components/FormularioLogin'

export const metadata = { title: 'Entrar — ChequeCerto' }

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        ChequeCerto
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Entrar</h1>
      <p className="mt-2 text-sm text-slate-600">
        O acesso é pela sua conta Google. Cada usuário vê apenas os próprios lotes.
      </p>

      {/* O formulário lê a querystring (`proximo`, `erro`), então precisa de
          fronteira de Suspense para o build não tentar pré-renderizá-lo. */}
      <Suspense
        fallback={<div className="mt-6 h-11 w-full animate-pulse rounded-lg bg-slate-200" />}
      >
        <FormularioLogin />
      </Suspense>
    </main>
  )
}
