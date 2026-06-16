/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f4f2fb',
          100: '#e9e4f6',
          200: '#d4caee',
          300: '#b5a4e1',
          400: '#9276d0',
          500: '#744dbd',
          600: '#5b3fa8',
          700: '#4c328e',
          800: '#3e2a74',
          900: '#33245e',
        },
        dark: {
          900: '#0f0f1a',
          800: '#14141f',
          700: '#1a1a2e',
          600: '#1f1f35',
          500: '#252540',
          400: '#2e2e50',
          300: '#3a3a60',
        },
      },
      animation: {
        'fade-in':     'fadeIn 0.3s ease-in-out',
        'slide-up':    'slideUp 0.4s ease-out',
        'pulse-slow':  'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'typing':      'typing 1.2s steps(3) infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        typing:  { '0%,100%': { opacity: '0.2' }, '50%': { opacity: '1' } },
      },
    },
  },
  plugins: [],
}
