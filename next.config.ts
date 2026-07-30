import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // As miniaturas dos cheques vêm de signed URLs do Supabase Storage e são
  // exibidas com <img> simples, então não há remotePatterns a configurar aqui:
  // o host do projeto é uma variável de ambiente, não um valor de build.
  reactStrictMode: true,
}

export default nextConfig
