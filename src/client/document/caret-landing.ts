'use sanity'

import { foldedMatchesIn } from '../../shared/case-folding.ts'
import type { CaretTarget } from '../platform/doc-path.ts'

const NOTHING_MATCHED = null

function nearestTo(offset: number, found: readonly number[]): number | null {
  const [first] = found
  if (first === undefined) return NOTHING_MATCHED

  return found.reduce((nearest, at) => (Math.abs(at - offset) < Math.abs(nearest - offset) ? at : nearest), first)
}

export function landingFor(text: string | null, { offset, matched }: CaretTarget): number {
  if (text === null || matched === null) return offset

  return nearestTo(offset, foldedMatchesIn(text, matched)) ?? offset
}
