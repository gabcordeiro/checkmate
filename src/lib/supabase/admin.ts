import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Cliente com service_role — IGNORA RLS.
 *
 * Existe só para jobs e webhooks server-side da fase 2. Nunca importe isto de
 * um componente client: a chave não tem prefixo NEXT_PUBLIC_ justamente para
 * o build falhar se alguém tentar.
 */
export function criarClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada — o cliente admin só roda no servidor.',
    )
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
