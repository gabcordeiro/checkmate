'use client'

import { useEffect, useState } from 'react'

/**
 * Envelope da transição "Panel reveal" do transitions.dev.
 *
 * Um elemento que já monta no estado final não transiciona — o browser não tem
 * de onde animar. Então montamos fechado e abrimos no frame seguinte.
 */
export default function PainelDeslizante({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAberto(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="t-panel-slide" data-open={aberto ? 'true' : 'false'}>
      {children}
    </div>
  )
}
