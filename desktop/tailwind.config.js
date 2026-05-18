/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344'
        },
        success: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
          700: '#047857'
        },
        warning: {
          50:  '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309'
        },
        danger: {
          50:  '#fff1f2',
          100: '#ffe4e6',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c'
        },
        info: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1'
        }
      },
      fontFamily: {
        sans: [
          'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI',
          'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'
        ],
        mono: [
          'JetBrains Mono', 'ui-monospace', 'SFMono-Regular',
          'Menlo', 'Monaco', 'Consolas', 'monospace'
        ]
      },
      boxShadow: {
        'card':  '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 10px 30px -24px rgb(15 23 42 / 0.35)',
        'pop':   '0 16px 36px -18px rgb(15 23 42 / 0.28), 0 6px 14px -8px rgb(15 23 42 / 0.16)',
        'modal': '0 24px 48px -12px rgb(15 23 42 / 0.30)'
      },
      borderRadius: {
        'xl2': '14px'
      },
      keyframes: {
        'in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'in-fade': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'in-scale': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        }
      },
      animation: {
        'in-up':    'in-up 180ms ease-out',
        'in-fade':  'in-fade 140ms ease-out',
        'in-scale': 'in-scale 160ms ease-out'
      }
    }
  },
  plugins: []
};
