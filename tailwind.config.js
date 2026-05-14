/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        accent: {
          DEFAULT: 'var(--accent, #0A84FF)',
          hover: 'var(--accent-hover, #3D9BFF)',
        },
        traffic: {
          red: '#FF5F57',
          yellow: '#FEBC2E',
          green: '#28C840',
        },
      },
      boxShadow: {
        window: '0 10px 40px -10px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.2)',
        'window-unfocused': '0 4px 16px -6px rgba(0,0,0,0.25)',
      },
      backdropBlur: {
        '3xl': '64px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'dock-bounce': 'dockBounce 0.6s ease-out',
        'pulse-soft': 'pulseSoft 2.6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        dockBounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-22px)' },
          '70%': { transform: 'translateY(-6px)' },
        },
        pulseSoft: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.06)', opacity: '0.85' },
        },
      },
    },
  },
  plugins: [],
};
