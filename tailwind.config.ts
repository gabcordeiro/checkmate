import type { Config } from 'tailwindcss'

/**
 * Paleta do Cheque Mate.
 *
 * Regra que manda em tudo: verde/amarelo/vermelho são RESERVADOS para o
 * semáforo de conferência (ok / conferir / banco pode devolver). É a informação
 * mais importante do produto, então nenhuma cor de marca pode competir com ela.
 * Por isso a marca é índigo/violeta — família visualmente distante das três, e
 * que carrega a leitura de "banco, confiança, precisão" sem gritar.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tinta: textos e superfícies escuras. Navio azulado, não preto puro —
        // preto puro sobre branco é o que dá cara de wireframe.
        tinta: {
          50: '#f6f7fb',
          100: '#eceef6',
          200: '#d6dae9',
          300: '#b2b9d3',
          400: '#8891b7',
          500: '#66709c',
          600: '#4f5881',
          700: '#404769',
          800: '#333857',
          900: '#22263c',
          950: '#141728',
        },
        // Marca: índigo → violeta. Usada em ação, foco e destaque.
        marca: {
          50: '#eef1ff',
          100: '#e0e5ff',
          200: '#c7cfff',
          300: '#a5aeff',
          400: '#8285fb',
          500: '#6b62f4',
          600: '#5a44e8',
          700: '#4c35cd',
          800: '#3f2ea6',
          900: '#362c83',
          950: '#211a4d',
          // Marcas de gráfico ficam aqui por compatibilidade com o cronograma:
          // `risco` é o vermelho de status reservado, nunca uma série qualquer.
          risco: '#d03b3b',
          neutro: '#64748b',
        },
        // Semáforo de conferência: os três estados que a operadora precisa
        // distinguir de relance, mesmo no celular sob luz ruim.
        ok: { bg: '#ecfdf5', border: '#a7f3d0', text: '#046c4e' },
        conferir: { bg: '#fffbeb', border: '#fde68a', text: '#8a5300' },
        devolve: { bg: '#fef2f2', border: '#fecaca', text: '#a51d1d' },
      },
      fontFamily: {
        sans: ['var(--fonte-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--fonte-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // Duas camadas: um contorno de 1px que separa da superfície e uma
        // sombra larga e fraca que dá profundidade sem escurecer a tela.
        carta: '0 1px 2px rgba(20, 23, 40, 0.04), 0 12px 32px -16px rgba(20, 23, 40, 0.18)',
        cartaAlta: '0 1px 2px rgba(20, 23, 40, 0.05), 0 24px 48px -20px rgba(20, 23, 40, 0.28)',
        botao: '0 1px 2px rgba(20, 23, 40, 0.12), 0 8px 20px -10px rgba(90, 68, 232, 0.55)',
      },
      backgroundImage: {
        'marca-gradiente': 'linear-gradient(135deg, #5a44e8 0%, #7c3aed 55%, #9333ea 100%)',
        'tinta-gradiente': 'linear-gradient(135deg, #22263c 0%, #362c83 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config
