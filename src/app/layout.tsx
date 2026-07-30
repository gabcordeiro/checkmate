import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cheque Mate — conferência de cheques pré-datados',
  description:
    'Leia o CMC7, organize o lote por emitente e pegue os erros que fazem o banco devolver o cheque, antes de lançar no sistema.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // A operadora fotografa e confere no celular; deixar dar zoom na miniatura
  // do cheque é requisito, não detalhe.
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
