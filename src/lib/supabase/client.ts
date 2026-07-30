'use client'

import { createBrowserClient } from '@supabase/ssr'
import {
  CHAVE_PLACEHOLDER,
  SUPABASE_CHAVE_PUBLICA,
  SUPABASE_URL,
  URL_PLACEHOLDER,
  supabaseConfigurado as configurado,
} from './env'
import type { Database } from './types'

/**
 * Flag usada na UI para mostrar um aviso de setup em vez de quebrar quando as
 * variáveis de ambiente ainda não foram configuradas (mesmo padrão do MatchCV).
 */
export const supabaseConfigurado = configurado

export function criarClienteBrowser() {
  return createBrowserClient<Database>(
    SUPABASE_URL || URL_PLACEHOLDER,
    SUPABASE_CHAVE_PUBLICA || CHAVE_PLACEHOLDER,
  )
}
