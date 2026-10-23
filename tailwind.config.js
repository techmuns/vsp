/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral ink / surface scale (slate-based, premium and calm)
        ink: '#0F172A',
        slate: '#334155',
        grey: '#64748B',
        muted: '#94A3B8',
        line: '#E7EAF0',
        canvas: '#F7F8FB',
        // One fixed colour per MONEY CONCEPT (a theme, never data). Mirrors src/lib/brand.ts.
        money: {
          in: '#10B981', // income / money in — emerald
          out: '#F43F5E', // spending / expense — rose
          invest: '#7C3AED', // investments — violet
          save: '#14B8A6', // savings — teal
          recv: '#F59E0B', // owed TO you (receivable) — amber
          owe: '#FB923C', // you OWE (payable) — orange
          reimb: '#0EA5E9', // reimbursements — sky
          card: '#D946EF', // credit card — fuchsia
          transfer: '#64748B', // transfer / neutral — slate
          net: '#6366F1', // net worth / brand — indigo
        },
        brand: {
          DEFAULT: '#6366F1',
          600: '#6366F1',
          700: '#4F46E5',
          violet: '#7C3AED',
          pink: '#EC4899',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.06)',
        'card-hover': '0 2px 4px rgba(15,23,42,0.06), 0 12px 32px rgba(15,23,42,0.10)',
        pop: '0 8px 28px rgba(15,23,42,0.16)',
        drawer: '-12px 0 40px rgba(15,23,42,0.18)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'slide-in': 'slide-in 0.28s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
};
