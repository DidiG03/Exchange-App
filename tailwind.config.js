/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0f1729',
          800: '#152238',
          700: '#1e3354'
        }
      }
    }
  },
  plugins: []
}
