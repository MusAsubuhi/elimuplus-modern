import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: '#0D3B3B', 700: '#145252', 600: '#1B6666', 100: '#D9ECE8', 50: '#EAF4F1' },
        gold: { DEFAULT: '#D4A843', 600: '#B88F2F', 100: '#F6EBCB' },
        mist: '#F5FAF8',
        ink: '#1B2A2A',
      },
      fontFamily: { sans: ['Lato', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
