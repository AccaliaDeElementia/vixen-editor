'use sanity'

const BEFORE = -1
const SAME = 0
const AFTER = 1

const byNumberRuns = new Intl.Collator(undefined, { numeric: true })
const byText = new Intl.Collator()

export function compareNames(a: string, b: string): number {
  const numerically = byNumberRuns.compare(a, b)
  if (numerically !== SAME) return numerically

  const textually = byText.compare(a, b)
  if (textually !== SAME) return textually

  if (a < b) return BEFORE

  return a > b ? AFTER : SAME
}
