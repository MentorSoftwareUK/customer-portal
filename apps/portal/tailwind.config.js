import flowbitePlugin from 'flowbite/plugin'

/** @type {import('tailwindcss').Config} */
export default {
  // We use a fixed brand theme (shell + main content) rather than following OS dark mode.
  // Using 'class' prevents `dark:` variants from activating via media queries.
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/flowbite/**/*.{js,ts}',
    './node_modules/flowbite-vue/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        // Used throughout the portal (e.g. bg-primary-600, text-primary-600).
        // Set to the brand pink so actions/links feel consistent.
        // This does NOT affect the branded shell colors (sidebar/topbar/main backgrounds)
        // which are driven by `brand.*` and explicit layout styles.
        primary: {
          50: '#fff0f8',
          100: '#ffe0f1',
          200: '#ffc2e4',
          300: '#ff94d1',
          400: '#ff5bb9',
          500: '#ff1f9e',
          600: '#e7007e',
          700: '#bf006a',
          800: '#970055',
          900: '#6f0041',
          950: '#4a002b',
        },
        brand: {
          primary: '#14192d',
          accent: '#e7007e',
          secondary: '#3A4051',
          button: '#3A4051',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [flowbitePlugin],
}
