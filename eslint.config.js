'use sanity'

import love from 'eslint-config-love'

/* describe > describe > it.each > callback is four deep by construction, so the
   shallowest clamp a test can meet is four rather than love's three. */
const MAX_NESTED_CALLBACKS = 4

/* A spec's length tracks how many behaviours its subject has, not how many
   responsibilities the file has, so love's 450 lands on files that are doing
   exactly one thing. Six specs here sit within twenty lines of it while only
   one module in src/ does, and the pressure has twice been paid in artificial
   edits rather than real splits. Shipped code stays at 450; a spec past 1000
   is still worth a look. The sibling project reached the same number. */
const MAX_SPEC_LINES = 1000

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'deploy/**', 'public/assets/**', 'test-results/**'],
  },
  {
    ...love,
    files: ['**/*.js', '**/*.ts'],
    languageOptions: {
      ...love.languageOptions,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...love.rules,
    },
  },
  {
    files: ['test/**/*.ts', 'test-browser/**/*.ts'],
    rules: {
      /* Boundary cases are the numbers. A test naming every off-by-one it probes
         would bury the case it is making. Shipped code has no such exemption. */
      '@typescript-eslint/no-magic-numbers': 'off',

      'max-nested-callbacks': ['error', MAX_NESTED_CALLBACKS],

      'max-lines': ['error', { max: MAX_SPEC_LINES, skipBlankLines: true, skipComments: true }],

      /* Unsatisfiable with require-await and return-await, which are both on:
         `() => Promise.resolve(x)` trips this rule, `async () => x` trips
         require-await, `async () => Promise.resolve(x)` trips return-await, and
         `async () => await Promise.resolve(x)` is the same thing spelled longer. */
      '@typescript-eslint/promise-function-async': 'off',
    },
  },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**'],
              importNames: ['TestOnly'],
              message: 'TestOnly is a module test-visible surface; shipping code must use its public exports.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.config.ts'],
    rules: {
      /* `thresholds: { 100: true }` is vitest's shape, where the number is the key. */
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
]
