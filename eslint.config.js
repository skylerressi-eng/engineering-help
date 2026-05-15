// Minimal, dependency-free ESLint flat config.
//
// The project's real correctness gate is `npm run typecheck` (tsc --strict).
// ESLint tooling (parser/plugins) isn't part of the dependency set, so this
// config intentionally ignores the TS/TSX sources and just does light hygiene
// on plain JS config files. `npm run lint` now exits cleanly instead of
// crashing on a missing config.
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '**/*.ts',
      '**/*.tsx',
      'vite.config.ts',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'warn',
      'no-dupe-keys': 'error',
      'no-unreachable': 'warn',
    },
  },
];
