/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: 'var(--color-primary)',
          fg: 'var(--color-primary-foreground)',
        },
      },
    },
  },
  plugins: [],
};
