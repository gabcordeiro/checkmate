import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_CHAVE_PUBLICA, SUPABASE_URL, supabaseConfigurado } from '@/lib/supabase/env'

/**
 * Renova o cookie de sessão do Supabase a cada navegação e barra as rotas
 * autenticadas. Sem isso a sessão expira no meio da conferência de um lote.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Sem env configurada, deixa passar: a UI mostra a tela de setup.
  if (!supabaseConfigurado) return response

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const rotaPublica =
    pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/auth')

  if (!user && !rotaPublica) {
    const login = request.nextUrl.clone()
    login.pathname = '/login'
    login.searchParams.set('proximo', pathname)
    return NextResponse.redirect(login)
  }

  if (user && pathname === '/login') {
    const lotes = request.nextUrl.clone()
    lotes.pathname = '/lotes'
    lotes.search = ''
    return NextResponse.redirect(lotes)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
}
