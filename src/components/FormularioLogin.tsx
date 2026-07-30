'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { criarClienteBrowser, supabaseConfigurado } from '@/lib/supabase/client'

export default function FormularioLogin() {
  const params = useSearchParams()
  const proximo = params.get('proximo') || '/lotes'
  // Erro devolvido pela rota /auth/callback quando o OAuth falha.
  const [erro, setErro] = useState<string | null>(params.get('erro'))
  const [enviando, setEnviando] = useState(false)

  async function entrarComGoogle() {
    setErro(null)
    if (!supabaseConfigurado) {
      setErro(
        'Supabase ainda não foi configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      )
      return
    }
    setEnviando(true)
    const supabase = criarClienteBrowser()
    const destino = new URL('/auth/callback', window.location.origin)
    destino.searchParams.set('proximo', proximo)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: destino.toString() },
    })
    if (error) {
      setErro(error.message)
      setEnviando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={entrarComGoogle}
        disabled={enviando}
        className="btn-secundario mt-6 w-full"
      >
        <svg viewBox="0 0 18 18" aria-hidden className="h-4 w-4">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
          />
        </svg>
        {enviando ? 'Abrindo o Google…' : 'Entrar com Google'}
      </button>

      {erro && (
        <p className="mt-4 rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2 text-sm text-devolve-text">
          {erro}
        </p>
      )}

      {!supabaseConfigurado && (
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Setup: no Supabase, habilite o provider Google em Authentication → Providers e adicione{' '}
          <code>{'<origem>'}/auth/callback</code> em Redirect URLs.
        </p>
      )}
    </>
  )
}
