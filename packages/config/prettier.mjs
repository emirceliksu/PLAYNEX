/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all',
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cn', 'cva'],
};
