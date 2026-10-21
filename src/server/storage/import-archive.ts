'use sanity'

import type { Actor } from '../platform/actor.ts'
import type { StoreLayer } from './fs-store.ts'
import { compareNames } from './primitives/name-order.ts'
import { EMPTY } from '../../shared/sequences.ts'
import { basenameOf, directoryOf } from '../../shared/link-paths.ts'
import { joinPath } from '../../shared/store-path.ts'
import { readZipEntries, eachZipFile } from './zip-entries.ts'
import { verdictFor, type ArchiveEntry } from './archive-entry.ts'
import type { TreeEntry } from './tree.ts'

interface ImportRequest {
  store: Pick<StoreLayer, 'tree' | 'createUpload'>
  archivePath: string
  into: string
  actor: Actor
}

type ImportOutcome =
  { kind: 'imported'; paths: string[] } | { kind: 'refused'; reasons: string[] } | { kind: 'collides'; paths: string[] }

const NOTHING_TO_TAKE = 'the archive holds nothing this store can take'

function pathsIn(entries: readonly TreeEntry[]): string[] {
  return entries.flatMap((entry) => (entry.kind === 'folder' ? pathsIn(entry.children) : [entry.path]))
}

function sorted(paths: readonly string[]): string[] {
  return [...paths].sort(compareNames)
}

interface Taking {
  from: string
  to: string
}

interface Decided {
  refusals: string[]
  taking: Taking[]
}

function decide(found: readonly ArchiveEntry[], into: string): Decided {
  const decided: Decided = { refusals: [], taking: [] }

  for (const entry of found) {
    const verdict = verdictFor(entry)
    if (verdict.decision === 'refuse') decided.refusals.push(verdict.reason)
    if (verdict.decision === 'import' && entry.name !== null) {
      decided.taking.push({ from: entry.name, to: joinPath(into, entry.name) })
    }
  }

  return decided
}

export async function importZip({ store, archivePath, into, actor }: ImportRequest): Promise<ImportOutcome> {
  const { refusals, taking } = decide(await readZipEntries(archivePath), into)
  if (refusals.length > EMPTY) return { kind: 'refused', reasons: sorted(refusals) }
  if (taking.length === EMPTY) return { kind: 'refused', reasons: [NOTHING_TO_TAKE] }

  const alreadyThere = new Set(pathsIn(await store.tree(compareNames)))
  const collides = taking.filter(({ to }) => alreadyThere.has(to)).map(({ to }) => to)
  if (collides.length > EMPTY) return { kind: 'collides', paths: sorted(collides) }

  const placed: string[] = []
  await eachZipFile(archivePath, new Set(taking.map(({ from }) => from)), async (name, bytes) => {
    const to = joinPath(into, name)
    placed.push(await store.createUpload(directoryOf(to), basenameOf(to), bytes, actor))
  })

  return { kind: 'imported', paths: sorted(placed) }
}
