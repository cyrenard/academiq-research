/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        aq: {
          ink: '#20242c',
          muted: '#6f7784',
          navy: '#1f315f',
          line: '#ddd9d1',
          paper: '#fbfaf7',
          panel: '#f5f2ec'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
        serif: ['Times New Roman', 'Times', 'serif']
      }
    }
  },
  plugins: []
};
