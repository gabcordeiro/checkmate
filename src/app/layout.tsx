import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

/**
 * Plus Jakarta Sans tem os números abertos e a caixa alta larga — ajuda numa
 * tela cheia de valor e de nome de emitente em CAIXA ALTA.
 * JetBrains Mono é para o CMC7: os 30 dígitos precisam de fonte onde 0/O e 1/l
 * não se confundem, porque conferir dígito é o trabalho.
 */
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--fonte-sans',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--fonte-mono',
})

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
  themeColor: '#f6f7fb',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
