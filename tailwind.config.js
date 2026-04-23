/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './documentos/**/*.html',
  ],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      animation: {
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
      },
    },
  },
  plugins: [],
};
