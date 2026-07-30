import { NextResponse, type NextRequest } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/server'

/**
 * Retorno do OAuth do Google: troca o `code` pela sessão e grava o cookie.
 * O registro em `profiles` é criado pelo trigger `on_auth_user_created`, então
 * não há nada a inserir daqui.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const proximo = searchParams.get('proximo') || '/lotes'
  const erroOauth = searchParams.get('error_description') || searchParams.get('error')

  if (erroOauth) {
    return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent(erroOauth)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent('Código ausente.')}`)
  }

  const supabase = await criarClienteServidor()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent(error.message)}`)
  }

  // `proximo` vem da querystring: só aceitamos caminho interno.
  const destino = proximo.startsWith('/') ? proximo : '/lotes'
  return NextResponse.redirect(`${origin}${destino}`)
}
