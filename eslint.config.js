import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import prettier from "eslint-config-prettier/flat"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
      // Advisory, not blocking: these flag legitimate patterns here (mount-time
      // init reading localStorage / the OAuth callback, and resetting modal
      // state on close). Surface as warnings rather than forcing risky
      // refactors. Revisit case-by-case.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/exhaustive-deps": "warn",
      // Stop stray debug `console.log` from shipping (a recurring source of
      // GitHub API response bodies leaking to the production console). Allow
      // `console.warn`/`console.error` for genuine diagnostics; DEV-only debug
      // logging should be guarded by `import.meta.env.DEV`.
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  // Last: turn off ESLint rules that conflict with Prettier (formatting is
  // Prettier's job). Must stay at the end of the array to win.
  prettier,
])
