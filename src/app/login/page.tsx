import { Suspense } from 'react'
import FormularioLogin from '@/components/FormularioLogin'
import Logo from '@/components/Logo'

export const metadata = { title: 'Entrar — Cheque Mate' }

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <div className="t-reveal cartao-destaque p-7 sm:p-8">
        <Logo tamanho={38} comNome />

        {/* O formulário lê a querystring (`proximo`, `erro`), então precisa de
            fronteira de Suspense para o build não tentar pré-renderizá-lo. */}
        <Suspense
          fallback={<div className="mt-8 h-72 w-full animate-pulse rounded-xl bg-tinta-100" />}
        >
          <FormularioLogin />
        </Suspense>
      </div>

      <p className="t-reveal t-reveal-2 mt-5 text-center text-xs text-tinta-500">
        Conferência de cheques pré-datados · cada usuário vê apenas os próprios lotes
      </p>
    </main>
  )
}
