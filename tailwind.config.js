/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: { 50:'#f0f7f2', 100:'#dcece1', 200:'#b7d8c1', 300:'#8abf9c', 400:'#55a073', 500:'#2f7a4b', 600:'#256a40', 700:'#1d5633', 800:'#164428', 900:'#0f3120' },
        cream: { 50:'#fffdf8', 100:'#fbf6ea', 200:'#f4ecd7' },
        urgent: { 100:'#ffe9d6', 200:'#ffd3ad', 500:'#f27a1a', 600:'#d9650b' },
        ink: { 300:'#c9cfcc', 500:'#5b6460', 700:'#363d39', 900:'#1f2522' }
      },
      fontFamily: { display: ['Fraunces', 'Georgia', 'serif'], sans: ['Figtree', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgba(15,49,32,.05), 0 8px 24px -12px rgba(15,49,32,.18)',
        lift: '0 2px 4px rgba(15,49,32,.06), 0 18px 40px -16px rgba(15,49,32,.30)'
      },
      borderRadius: { xl2: '1.25rem', xl3: '1.75rem' },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        rise: { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } }
      },
      animation: { float: 'float 6s ease-in-out infinite', rise: 'rise .6s ease-out both' }
    }
  },
  plugins: []
}
