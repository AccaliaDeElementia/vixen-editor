'use sanity'

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unnecessary-type-parameters -- both
   rules are right about this function: it is an unchecked assertion, and T only names the return. It is the one audited
   place a test may claim a fake satisfies a production type, and routing every such claim through it is what lets
   no-unsafe-type-assertion stay on across the whole suite, so a new unchecked assertion in a test is a lint failure
   rather than a habit. It checks nothing -- a fake that drifts from the type it claims fails in the test that uses it. */
export function cast<T>(value: unknown): T {
  return value as T
}
/* eslint-enable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unnecessary-type-parameters -- ends the pair above */
