/**
 * Tailwind CSS v4 integration. The PostCSS plugin lives in its own package
 * (`@tailwindcss/postcss`); v4 handles @import inlining and vendor prefixing,
 * so postcss-import / autoprefixer are intentionally absent.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
