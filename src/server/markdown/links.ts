'use sanity'

import { SEQUENCE_START } from '../../shared/sequences.ts'
import { encodeDestination } from '../../shared/link-syntax.ts'

import { parse, postprocess, preprocess } from 'micromark'

interface LinkDestination {
  value: string
  start: number
  end: number
  bracketed: boolean
}

const DESTINATION_TOKENS = new Set(['resourceDestinationString', 'definitionDestinationString'])

// CommonMark: a backslash escapes any ASCII punctuation character.
const BACKSLASH_ESCAPE = /\\(?<punctuation>[!-\/:-@\[-`\{-~])/gv
const PERCENT_RUN = /(?:%[0-9A-Fa-f]{2})+/gv
const PRECEDING_CHARACTER = 1

function decodePercentRun(run: string): string {
  try {
    return decodeURIComponent(run)
  } catch {
    return run
  }
}

function decodeDestination(raw: string): string {
  return raw.replace(BACKSLASH_ESCAPE, '$<punctuation>').replace(PERCENT_RUN, decodePercentRun)
}

function findLinkDestinations(markdown: string): LinkDestination[] {
  const events = postprocess(
    parse()
      .document()
      .write(preprocess()(markdown, undefined, true)),
  )
  const found: LinkDestination[] = []

  for (const [kind, token] of events) {
    if (kind !== 'enter' || !DESTINATION_TOKENS.has(token.type)) continue

    const {
      start: { offset: start },
      end: { offset: end },
    } = token

    found.push({
      value: decodeDestination(markdown.slice(start, end)),
      start,
      end,
      bracketed: markdown[start - PRECEDING_CHARACTER] === '<',
    })
  }

  return found
}

export function rewriteLinkDestinations(markdown: string, rewrite: (destination: string) => string): string {
  let result = markdown

  for (const destination of findLinkDestinations(markdown).reverse()) {
    const replacement = rewrite(destination.value)
    if (replacement === destination.value) continue

    const encoded = encodeDestination(replacement, destination.bracketed)
    result = result.slice(SEQUENCE_START, destination.start) + encoded + result.slice(destination.end)
  }

  return result
}

export const TestOnly = { decodeDestination, findLinkDestinations }
