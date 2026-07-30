import { Suspense } from 'react'
import FormularioLogin from '@/components/FormularioLogin'

export const metadata = { title: 'Entrar — ChequeCerto' }

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        ChequeCerto
      </p>

      {/* O formulário lê a querystring (`proximo`, `erro`), então precisa de
          fronteira de Suspense para o build não tentar pré-renderizá-lo. */}
      <Suspense
        fallback={<div className="mt-8 h-64 w-full animate-pulse rounded-lg bg-slate-200" />}
      >
        <FormularioLogin />
      </Suspense>
    </main>
  )
}
