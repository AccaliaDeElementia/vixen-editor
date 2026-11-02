'use sanity'

const TEXT_START = 0
const NOT_FOUND = -1

function offsetsAsWritten(text: string, folded: string): readonly number[] | null {
  if (folded.length === text.length) return null

  const asWritten: number[] = []
  let at = TEXT_START

  for (const character of text) {
    const { length: unitsWhenFolded } = character.toLowerCase()
    const startsAt = at
    asWritten.push(...Array.from({ length: unitsWhenFolded }, () => startsAt))
    at += character.length
  }

  return asWritten
}

export function foldedMatchesIn(text: string, needle: string): readonly number[] {
  const folded = text.toLowerCase()
  const wanted = needle.toLowerCase()
  const asWritten = offsetsAsWritten(text, folded)
  const found: number[] = []

  for (let at = folded.indexOf(wanted); at !== NOT_FOUND; at = folded.indexOf(wanted, at + wanted.length)) {
    found.push(asWritten?.[at] ?? at)
  }

  return found
}
