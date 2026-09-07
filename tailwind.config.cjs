module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: { 1: 'var(--surface-1)', 2: 'var(--surface-2)', 3: 'var(--surface-3)' },
        line: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)', accent: 'var(--border-accent)' },
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          accent: 'var(--text-accent)',
          warning: 'var(--text-warning)',
          danger: 'var(--text-danger)',
          success: 'var(--text-success)',
          onaccent: 'var(--text-on-accent)',
        },
        fill: {
          accent: 'var(--fill-accent)',
          field: 'var(--fill-field)',
          selected: 'var(--fill-selected)',
          hover: 'var(--fill-hover)',
        },
        tint: {
          accent: 'var(--bg-accent)',
          warning: 'var(--bg-warning)',
          danger: 'var(--bg-danger)',
          success: 'var(--bg-success)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Controls 8px, cards 12px. Flat surfaces — no elevation scale.
      borderRadius: { DEFAULT: '8px', md: '8px', lg: '8px', xl: '12px' },
    },
  },
  plugins: [],
};
