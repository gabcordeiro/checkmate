import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/server'
import { traduzirErroAuth } from '@/lib/authErros'

/**
 * Retorno de tudo que vem por link: OAuth do Google, confirmação de e-mail e
 * recuperação de senha. Troca o código pela sessão e grava o cookie.
 *
 * Dois formatos são aceitos, porque dependem de como os templates de e-mail do
 * projeto estão escritos:
 *   ?code=...                    → fluxo PKCE (padrão do Supabase hoje)
 *   ?token_hash=...&type=recovery → templates que usam {{ .TokenHash }}
 *
 * O registro em `profiles` é criado pelo trigger `on_auth_user_created`, então
 * não há nada a inserir daqui.
 */

function paraLogin(origin: string, mensagem: string) {
  return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent(mensagem)}`)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const tipo = searchParams.get('type') as EmailOtpType | null
  const erroOauth = searchParams.get('error_description') || searchParams.get('error')

  // `proximo` vem da querystring: só aceitamos caminho interno.
  const proximoBruto = searchParams.get('proximo') || '/lotes'
  const proximo = proximoBruto.startsWith('/') ? proximoBruto : '/lotes'
  // Link de recuperação sempre termina na tela de definir senha, mesmo que o
  // `proximo` tenha vindo de outro lugar.
  const destino = tipo === 'recovery' ? '/nova-senha' : proximo

  if (erroOauth) return paraLogin(origin, traduzirErroAuth(erroOauth))

  const supabase = await criarClienteServidor()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return paraLogin(origin, traduzirErroAuth(error.message))
    return NextResponse.redirect(`${origin}${destino}`)
  }

  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
    if (error) return paraLogin(origin, traduzirErroAuth(error.message))
    return NextResponse.redirect(`${origin}${destino}`)
  }

  return paraLogin(origin, 'Link inválido ou incompleto. Peça um novo.')
}
