'use sanity'

const BEFORE = -1
const SAME = 0
const AFTER = 1

export type NameComparator = (a: string, b: string) => number

export function compareNamesIn(locale?: string): NameComparator {
  const byNumberRuns = new Intl.Collator(locale, { numeric: true })
  const byText = new Intl.Collator(locale)

  return (a, b) => {
    const numerically = byNumberRuns.compare(a, b)
    if (numerically !== SAME) return numerically

    const textually = byText.compare(a, b)
    if (textually !== SAME) return textually

    if (a < b) return BEFORE

    return a > b ? AFTER : SAME
  }
}

const inHostLocale = compareNamesIn()

export function compareNames(a: string, b: string): number {
  return inHostLocale(a, b)
}
