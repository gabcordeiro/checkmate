import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

export const supabaseConfiguradoServidor = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

/**
 * Cliente para Server Components, Route Handlers e Server Actions.
 * Usa a anon key + cookie de sessão, então TODA query passa por RLS — é isso
 * que garante que a operadora só veja os lotes dela.
 */
export async function criarClienteServidor() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Component não pode escrever cookie. O middleware já
            // renovou a sessão, então aqui é seguro ignorar.
          }
        },
      },
    },
  )
}
