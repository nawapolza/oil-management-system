/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Noto Sans Thai', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        soft: '0 18px 60px rgba(15, 23, 42, 0.10)',
      },
    },
  },
  plugins: [],
}
