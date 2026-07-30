import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Renova o cookie de sessão do Supabase a cada navegação e barra as rotas
 * autenticadas. Sem isso a sessão expira no meio da conferência de um lote.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Sem env configurada, deixa passar: a UI mostra a tela de setup.
  if (!url || !anonKey) return response

  const supabase = createServerClient(url, anonKey, {
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
