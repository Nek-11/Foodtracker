/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pine: {
          50:  '#eaf5ee',
          100: '#c5e5d0',
          200: '#96cfae',
          300: '#63b587',
          400: '#3d9b6a',
          500: '#2a7d52',
          600: '#1e623f',
          700: '#15472d',
          800: '#1a3828',
          900: '#162d20',
          950: '#0f2018',
        },
        cream: {
          50:  '#fdfcf9',
          100: '#f5f0e8',
          200: '#ede8dc',
          300: '#d9d2c5',
          400: '#c2b89f',
          500: '#a09278',
          600: '#7a6e58',
          700: '#554d3c',
          800: '#342f26',
          900: '#1a1710',
          950: '#0a0907',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans:    ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        shimmer:  'shimmer 1.8s linear infinite',
        'fade-in': 'fadeIn 0.25s ease-out',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-300% 0' },
          '100%': { backgroundPosition: '300% 0' },
        },
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
