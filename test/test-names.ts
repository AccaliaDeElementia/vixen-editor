'use sanity'

const A_CALL = '('

const TEST_NAME =
  /(?<![.\w$])(?:it|test)(?:\.each(?:<[^>]*>)?\((?:.|\n)*?\)\s*)?\(\s*(?<quote>[\x60'"])(?<name>(?:(?!\k<quote>).)*)\k<quote>/gv

const NAMED_IDENTIFIER = /\b\p{Ll}+\p{Lu}\p{L}*\b/gv

export function namesOfTestsIn(contents: string): string[] {
  return [...contents.matchAll(TEST_NAME)]
    .map((match) => match.groups?.name ?? '')
    .filter((name) => !name.includes(A_CALL))
}

export function identifiersIn(text: string): string[] {
  return [...text.matchAll(NAMED_IDENTIFIER)].map((match) => match[0])
}
