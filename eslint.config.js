import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-console": "off",
      // TypeScript's own compiler already catches genuine undefined-variable
      // errors, and does so correctly for type-only identifiers (RequestInit,
      // etc.) that base ESLint's no-undef doesn't know about.
      "no-undef": "off",
    },
  },
  {
    // python/** must stay ignored even though it isn't in a top-level
    // .gitignore entry as such: ESLint 9's flat config does not consult
    // .gitignore by default, so following the README's own documented
    // Python setup (`cd python && python3 -m venv .venv`) and then running
    // `npm run lint` from the repo root would otherwise have ESLint's
    // untargeted js.configs.recommended block walk into the venv's bundled
    // JS fixtures (e.g. urllib3's emscripten worker, pywin32's test
    // scripts) and fail lint on files that aren't part of this project.
    ignores: ["dist/**", "node_modules/**", "coverage/**", "python/**"],
  },
];
