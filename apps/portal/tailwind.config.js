import flowbitePlugin from 'flowbite/plugin'

/** @type {import('tailwindcss').Config} */
export default {
  // Dark mode disabled — portal is light-mode only.
  // The navigation chrome (sidebar + topbar) intentionally uses brand dark navy.
  darkMode: false,
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/flowbite/**/*.{js,ts}',
    './node_modules/flowbite-vue/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        // ─── Grey palette — warm stone (matches mentor-ux-v3 design system) ──────
        // Overrides Tailwind's default cool grey. All gray-* utilities use this scale.
        gray: {
          50:  '#FAFAF9',
          100: '#F5F5F4',
          150: '#EFEFED',
          200: '#E7E5E4',
          300: '#D4D2CF',
          400: '#A8A29E',
          500: '#78716C',
          600: '#57534E',
          700: '#44403C',
          800: '#292524',
          900: '#1C1917',
          950: '#0F0E0D',
        },

        // ─── Brand accent scale ───────────────────────────────────────────────
        primary: {
          50:  '#fff0f8',
          100: '#ffe0f1',
          200: '#ffc2e4',
          300: '#ff94d1',
          400: '#ff5bb9',
          500: '#ff1f9e',
          600: '#e7007e',   // brand magenta — buttons, active states, links
          700: '#bf006a',
          800: '#970055',
          900: '#6f0041',
          950: '#4a002b',
        },

        // ─── Navigation chrome ────────────────────────────────────────────────
        brand: {
          primary:   '#14192d',   // dark navy — sidebar/topbar background
          accent:    '#e7007e',   // magenta — CTAs, active nav, highlights
          secondary: '#3A4051',
          button:    '#3A4051',
        },

        // ─── Semantic surface tokens ──────────────────────────────────────────
        page: '#F5F5F4',        // bg-page — warm stone, matches v3 body background
        surface: {
          DEFAULT: '#ffffff',
          muted:   '#F5F5F4',
          raised:  '#ffffff',
        },
        border: {
          DEFAULT: '#E7E5E4',   // warm stone border
          strong:  '#D4D2CF',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        // Navy-tinted shadows — matches mentor-ux-v3 shadow system
        sm:          '0 1px 2px rgba(20,25,45,0.04), 0 1px 3px rgba(20,25,45,0.06)',
        md:          '0 2px 4px rgba(20,25,45,0.04), 0 6px 16px rgba(20,25,45,0.08)',
        lg:          '0 4px 8px rgba(20,25,45,0.04), 0 12px 32px rgba(20,25,45,0.10)',
        xl:          '0 8px 16px rgba(20,25,45,0.06), 0 24px 56px rgba(20,25,45,0.14)',
        card:        '0 2px 4px rgba(20,25,45,0.04), 0 6px 16px rgba(20,25,45,0.08)',
        'card-hover':'0 4px 8px rgba(20,25,45,0.06), 0 12px 32px rgba(20,25,45,0.10)',
        'card-raised':'0 8px 16px rgba(20,25,45,0.08), 0 24px 56px rgba(20,25,45,0.12)',
      },
      // ─── Typography scale (v3 spec) ─────────────────────────────────────────
      // Page title:          text-2xl font-semibold tracking-tight text-black
      // Section heading:     text-base font-semibold tracking-tight text-black
      // Body:                text-sm font-normal text-gray-700 leading-relaxed
      // Secondary / label:   text-xs font-medium text-gray-500
      // Hint / meta:         text-xs font-normal text-gray-400
      // Two weights only:    font-normal (400) and font-semibold (600). No font-bold.
    },
  },
  plugins: [flowbitePlugin],
}
