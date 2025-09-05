/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'neon': '#00FF00',
        'neon-text': '#00CC00', // Darker green for better text readability on white
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'typing': 'typing 1.5s steps(3) infinite',
      },
      keyframes: {
        typing: {
          '0%, 60%, 100%': { opacity: '0' },
          '30%': { opacity: '1' },
        }
      },
    },
  },
  plugins: [],
}