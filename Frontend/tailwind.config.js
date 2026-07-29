/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        revealUp: {
          '0%': { opacity: '0', transform: 'translateY(56px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideFromLeft: {
          '0%': { opacity: '0', transform: 'translateX(-44px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideFromRight: {
          '0%': { opacity: '0', transform: 'translateX(44px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        floatY: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-18px)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 16px rgba(41,216,213,0.25), 0 0 40px rgba(41,216,213,0.08)' },
          '50%': { boxShadow: '0 0 36px rgba(41,216,213,0.6), 0 0 80px rgba(41,216,213,0.22)' },
        },
        ripple: {
          '0%': { transform: 'scale(1)', opacity: '0.5' },
          '100%': { transform: 'scale(3)', opacity: '0' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(110%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blobFloat: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(20px, -24px) scale(1.07)' },
          '66%': { transform: 'translate(-14px, 14px) scale(0.95)' },
        },
        blobFloatAlt: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(-16px, 18px) scale(0.94)' },
          '66%': { transform: 'translate(22px, -12px) scale(1.06)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400% center' },
          '100%': { backgroundPosition: '400% center' },
        },
        sweepLeft: {
          '0%': { transform: 'translateX(-160%) skewX(-15deg)' },
          '100%': { transform: 'translateX(260%) skewX(-15deg)' },
        },
        spinSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        marqueeLeft: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fadeIn 0.5s ease-out both',
        'reveal-up': 'revealUp 0.8s cubic-bezier(0.22,1,0.36,1) both',
        'slide-from-left': 'slideFromLeft 0.75s cubic-bezier(0.22,1,0.36,1) both',
        'slide-from-right': 'slideFromRight 0.75s cubic-bezier(0.22,1,0.36,1) both',
        'float': 'floatY 6s ease-in-out infinite',
        'float-slow': 'floatY 9s ease-in-out infinite',
        'float-xs': 'floatY 4s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2.4s ease-in-out infinite',
        'ripple': 'ripple 2s ease-out infinite',
        'ripple-delay': 'ripple 2s ease-out 0.8s infinite',
        'slide-up': 'slideUp 0.45s cubic-bezier(0.22,1,0.36,1) both',
        'blob-float': 'blobFloat 8s ease-in-out infinite',
        'blob-float-alt': 'blobFloatAlt 11s ease-in-out infinite',
        'shimmer': 'shimmer 3s linear infinite',
        'sweep': 'sweepLeft 3.5s ease-in-out infinite 1.2s',
        'spin-slow': 'spinSlow 12s linear infinite',
        'scale-in': 'scaleIn 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'marquee': 'marqueeLeft 32s linear infinite',
      },
    },
  },
  plugins: [],
}

