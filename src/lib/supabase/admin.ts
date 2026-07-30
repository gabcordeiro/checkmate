import { createClient } from '@supabase/supabase-js'
import { chaveDeServico, SUPABASE_URL } from './env'
import type { Database } from './types'

/**
 * Cliente com a chave de serviço — IGNORA RLS.
 *
 * Existe só para jobs e webhooks server-side da fase 2. Nunca importe isto de
 * um componente client: as variáveis não têm prefixo NEXT_PUBLIC_ justamente
 * para o build falhar se alguém tentar.
 */
export function criarClienteAdmin() {
  const chave = chaveDeServico()
  if (!SUPABASE_URL || !chave) {
    throw new Error(
      'Defina SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY) — o cliente admin só roda no servidor.',
    )
  }
  return createClient<Database>(SUPABASE_URL, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
