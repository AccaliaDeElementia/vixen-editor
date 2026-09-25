'use sanity'

import love from 'eslint-config-love'

/* describe > describe > it.each > callback is four deep by construction, so the
   shallowest clamp a test can meet is four rather than love's three. */
const MAX_NESTED_CALLBACKS = 4

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
        /* Widened from love's `projectService: true` so this file is linted too.
           Only `*.js` may be listed: allowDefaultProject errors on a file that a
           tsconfig already covers, which every .ts file here is. */
        projectService: {
          allowDefaultProject: ['*.js'],
        },
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
