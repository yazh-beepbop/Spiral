/**
 * ESLint 9 flat configuration for Spiral (`eslint.config.mjs`).
 *
 * Extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
 * via FlatCompat so `npm run lint` validates App Router and strict TypeScript rules.
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@next/next/no-page-custom-font": "off",
    },
  },
];

export default eslintConfig;
