import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  // Build output and tool-generated dirs - nothing here is meant to be linted.
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // App code (browser context).
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Registered directly by rule id rather than via a shared "recommended"
      // config export - eslint-plugin-react-hooks' flat-config export shape
      // has changed across recent versions (a v6.1.0 release even shipped
      // one that wasn't directly usable in a flat config array), and this
      // was wired up somewhere that can't `npm install` to find out which
      // shape actually landed. Rule ids themselves are stable regardless.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": "warn",
      // TypeScript's own compiler already catches undefined-variable errors,
      // and does it correctly for TS-only constructs (types, ambient globals)
      // that ESLint's parser doesn't know about - standard typescript-eslint
      // guidance is to defer to tsc here rather than double up.
      "no-undef": "off",
    },
  },

  // Service worker template (root-level, plain JS, sw global scope - not app
  // code, so it's outside the src/** block above).
  {
    files: ["sw-template.js"],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },

  // Node-context config and script files.
  {
    files: ["*.config.{js,ts}", "scripts/**/*.{js,ts}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Playwright specs and helpers - Node-context test runner, not the browser
  // page context they're driving.
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Test files commonly use `any` in fixtures and helpers, so allow it here
  // without relaxing the rule for app source.
  {
    files: [
      "tests/**/*.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/__tests__/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Must stay last - turns off ESLint's own stylistic rules that would
  // otherwise fight Prettier's formatting. Prettier itself runs separately
  // (`npm run format`), not as an ESLint rule - keeps linting fast and the
  // two tools' jobs cleanly separated.
  prettierConfig,
);
