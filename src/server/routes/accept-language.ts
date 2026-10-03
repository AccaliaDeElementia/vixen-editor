'use sanity'

import { SEQUENCE_START } from '../../shared/sequences.ts'

export const ACCEPT_LANGUAGE = 'accept-language'
export const VARIES_BY_LANGUAGE = { vary: 'Accept-Language' } as const

const QUALITY = /;\s*q=(?<quality>[^;,\s]+)/v
const DEFAULT_QUALITY = 1
const UNACCEPTABLE = 0
const HIGHEST_FIRST = -1
const TAG = 0
const NOT_FOUND = -1

interface RankedTag {
  tag: string
  quality: number
}

function qualityOf(part: string): number {
  const { quality } = QUALITY.exec(part)?.groups ?? {}
  if (quality === undefined) return DEFAULT_QUALITY

  const parsed = Number(quality)

  return Number.isFinite(parsed) ? parsed : UNACCEPTABLE
}

function tagOf(part: string): string {
  const parameters = part.indexOf(';')

  return (parameters === NOT_FOUND ? part : part.slice(SEQUENCE_START, parameters)).trim()
}

function rankedTags(header: string): RankedTag[] {
  const ranked = header.split(',').flatMap((part) => {
    const tag = tagOf(part)
    const quality = qualityOf(part)

    return tag === '' || quality <= UNACCEPTABLE ? [] : [{ tag, quality }]
  })

  return ranked.sort((a, b) => (a.quality - b.quality) * HIGHEST_FIRST)
}

function collatableOrNull(tag: string): string | null {
  try {
    return Intl.Collator.supportedLocalesOf([tag])[TAG] ?? null
  } catch {
    return null
  }
}

export function preferredLocale(header: string | undefined): string | undefined {
  if (header === undefined) return undefined

  for (const { tag } of rankedTags(header)) {
    const collatable = collatableOrNull(tag)
    if (collatable !== null) return collatable
  }

  return undefined
}
