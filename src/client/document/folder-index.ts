'use sanity'

import type { LoadedDocument, Session } from './session.ts'

type LoadOutcome = { reached: true; document: LoadedDocument } | { reached: false; error: unknown }

type IndexOutcome = { reached: true; entryPath: string; loaded: LoadedDocument } | { reached: false; error: unknown }

async function loadOrReport(session: Session, id: string): Promise<LoadOutcome> {
  try {
    return { reached: true, document: await session.load(id) }
  } catch (error) {
    return { reached: false, error }
  }
}

export async function resolveIndex(
  session: Session,
  entryPath: string,
  alternate: string | null,
): Promise<IndexOutcome> {
  const outcome = await loadOrReport(session, entryPath)
  if (!outcome.reached) return outcome
  if (outcome.document.stored || alternate === null) return { reached: true, entryPath, loaded: outcome.document }

  const beside = await loadOrReport(session, alternate)
  if (!beside.reached) return beside
  if (!beside.document.stored) return { reached: true, entryPath, loaded: outcome.document }

  return { reached: true, entryPath: alternate, loaded: beside.document }
}
