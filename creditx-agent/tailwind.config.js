/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cx: {
          primary: '#0A4F2A',
          'primary-light': '#1a7a45',
          'primary-dark': '#063a1e',
          accent: '#C9A227',
          danger: '#dc2626',
          success: '#16a34a',
        },
      },
    },
  },
  plugins: [],
};
