/** Tailwind v4 minimal config (content scanning is automatic) */
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts}',
    './node_modules/flowbite/**/*.js'
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Momo Trust Display"', 'Nunito', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Nunito', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    }
  },
  plugins: [require('flowbite/plugin')],
};
