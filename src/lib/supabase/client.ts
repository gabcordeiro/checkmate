'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Flag usada na UI para mostrar um aviso de setup em vez de quebrar quando as
 * variáveis de ambiente ainda não foram configuradas (mesmo padrão do MatchCV).
 */
export const supabaseConfigurado = Boolean(url && anonKey)

export function criarClienteBrowser() {
  return createBrowserClient<Database>(
    url || 'https://placeholder.supabase.co',
    anonKey || 'placeholder-anon-key',
  )
}
