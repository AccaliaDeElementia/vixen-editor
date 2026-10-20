'use sanity'

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unnecessary-type-parameters -- an
   unchecked assertion is what this function is, and T only names its return. */
export function cast<T>(value: unknown): T {
  return value as T
}
/* eslint-enable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unnecessary-type-parameters -- ends the pair above */
