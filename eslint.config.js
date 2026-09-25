'use sanity'

import love from 'eslint-config-love'

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
        // eslint-config-love sets parserOptions.project = true, which resolves
        // only the nearest tsconfig.json and so misses the split server/client
        // projects. Listing a .ts file here as well would be an error, because
        // every .ts file is already covered by tsconfig.json.
        projectService: {
          allowDefaultProject: ['*.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...love.rules,

      /* Relaxed: the v flag changes character-class and case-folding semantics.
         These patterns are deliberately ASCII-only, so it risks behaviour change
         for no benefit. */
      'require-unicode-regexp': 'off',

      /* Relaxed: reports `const first = parts[0]` in favour of array
         destructuring, which is not clearer when the index is meaningful. */
      '@typescript-eslint/prefer-destructuring': 'off',
    },
  },
  {
    files: ['test/**/*.ts', 'test-browser/**/*.ts'],
    rules: {
      /* Tests assert on values the types cannot narrow, and arrange deliberately
         invalid input to prove validation rejects it. */
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',

      /* `let subject: T` assigned in beforeEach is the standard fixture pattern;
         initialising at the declaration would be dead work overwritten per test. */
      '@typescript-eslint/init-declarations': 'off',

      /* describe > describe > it.each > callback is four deep by construction. */
      'max-nested-callbacks': 'off',

      /* Test helpers returning promises read better without the async ceremony. */
      '@typescript-eslint/promise-function-async': 'off',
    },
  },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      /* A `TestOnly` container is a module's test-visible surface, not its
         contract. Shipping code that imported one would make it contract by
         use, which is the conflation the container exists to end. */
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
    files: ['*.config.ts', 'test-browser/playwright.config.ts', 'scripts/**/*.ts'],
    rules: {
      /* Ports, timeouts and threshold percentages are self-describing in context. */
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
]
