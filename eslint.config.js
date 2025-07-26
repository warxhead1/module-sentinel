import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // Critical TypeScript rules only
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // Critical JavaScript rules only
      "no-debugger": "error",
      "no-alert": "error",
      "no-var": "error",
      "prefer-const": "error",

      // Disable style rules that would cause too many errors
      "comma-dangle": "off",
      curly: "off",
      eqeqeq: "off",

      // Disable rules that conflict with TypeScript
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-console": "off", // We use console for logging
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-debugger": "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    ignores: [
      "dist/**/*",
      "node_modules/**/*",
      "dashboard/dist/**/*",
      "coverage/**/*",
      "*.config.js",
      "vite.config.ts",
    ],
  },
];
