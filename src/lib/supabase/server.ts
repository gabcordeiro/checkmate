import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  CHAVE_PLACEHOLDER,
  SUPABASE_CHAVE_PUBLICA,
  SUPABASE_URL,
  URL_PLACEHOLDER,
  supabaseConfigurado,
} from './env'
import type { Database } from './types'

export const supabaseConfiguradoServidor = supabaseConfigurado

/**
 * Cliente para Server Components, Route Handlers e Server Actions.
 * Usa a chave pública + cookie de sessão, então TODA query passa por RLS — é
 * isso que garante que a operadora só veja os lotes dela.
 */
export async function criarClienteServidor() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    SUPABASE_URL || URL_PLACEHOLDER,
    SUPABASE_CHAVE_PUBLICA || CHAVE_PLACEHOLDER,
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
