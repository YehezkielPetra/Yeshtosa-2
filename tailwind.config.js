/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/views/**/*.ejs', './public/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        ink: '#2B2420',
        cream: '#FBF7F0',
        clay: '#C1502E',
        'clay-dark': '#9C3D22',
        gold: '#C9A24B',
        sage: '#6B8F71',
        'sage-dark': '#4F6E55',
        frost: '#5B7C99',
        warn: '#B8482F',
        line: '#E4DBC9',
        panel: '#FFFFFF',
      },
      fontFamily: {
        display: ['"Fraunces"', '"Georgia"', 'serif'],
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(43,36,32,0.06), 0 1px 1px rgba(43,36,32,0.04)',
      },
    },
  },
  plugins: [],
};
