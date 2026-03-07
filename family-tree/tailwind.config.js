/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Playfair Display', 'serif'],
        body: ['Lora', 'serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        parchment: {
          50: '#fdf8f0',
          100: '#f7edd8',
          200: '#eedcb8',
          300: '#e2c58e',
          400: '#d4a85f',
          500: '#c49040',
        },
        bark: {
          800: '#2c1f0e',
          900: '#1a1208',
        },
        moss: {
          500: '#4a6741',
          600: '#3a5232',
          700: '#2d4027',
        },
        stone: {
          750: '#3c3830',
        }
      }
    },
  },
  plugins: [],
}
