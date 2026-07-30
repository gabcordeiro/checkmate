import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semáforo de conferência: os três estados que a operadora precisa
        // distinguir de relance, mesmo no celular sob luz ruim.
        ok: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
        conferir: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
        devolve: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
