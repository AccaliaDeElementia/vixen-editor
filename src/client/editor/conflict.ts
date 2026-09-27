'use sanity'

import { DocumentRequestError } from './document-client.ts'
import type { Dialogs } from '../files/dialogs.ts'
import type { FilesClient } from '../files/files-client.ts'
import { errorMessage } from '../error-message.ts'

const HTTP_CONFLICT = 412

const TAKE_THEIRS = 'theirs'
const KEEP_MINE = 'mine'
const KEEP_BOTH = 'both'

const RESOLUTIONS = [
  { value: TAKE_THEIRS, label: 'Use the version on disk, discarding my changes' },
  { value: KEEP_MINE, label: 'Overwrite the version on disk with mine' },
  { value: KEEP_BOTH, label: 'Keep mine as a separate document, then use the version on disk' },
]

const COPY_SUFFIX = '-mine'
const EXTENSION_AT_THE_END = /(?<extension>\.[^.\/]*)?$/v

interface Conflict {
  target: string
  theirs: string
  mine: string
}

export interface ConflictOptions {
  dialogs: Dialogs
  files: FilesClient
  takeTheirs: (content: string) => void
  keepMine: () => Promise<void>
  announce: (text: string) => void
}

export function isConflict(error: unknown): boolean {
  return error instanceof DocumentRequestError && error.status === HTTP_CONFLICT
}

function copyNameFor(target: string): string {
  return target.replace(EXTENSION_AT_THE_END, `${COPY_SUFFIX}$<extension>`)
}

async function createdAt(files: FilesClient, entryPath: string, content: string): Promise<string | null> {
  try {
    await files.createDocument(entryPath, content)

    return null
  } catch (error) {
    return errorMessage(error)
  }
}

async function keepBoth(options: ConflictOptions, conflict: Conflict): Promise<boolean> {
  const { dialogs, files, takeTheirs, announce } = options
  const { target, theirs, mine } = conflict
  const kept = { at: copyNameFor(target) }

  const created = await dialogs.prompt({
    title: `Keep your version of ${target}`,
    label: 'Save it as',
    confirmLabel: 'Keep both',
    value: kept.at,
    submit: async (entryPath) => {
      kept.at = entryPath

      return await createdAt(files, entryPath, mine)
    },
  })
  if (!created) return false

  takeTheirs(theirs)
  announce(`Your version was kept as ${kept.at}`)

  return true
}

export async function offerResolution(options: ConflictOptions, conflict: Conflict): Promise<boolean> {
  const { dialogs, takeTheirs, keepMine } = options
  const { target, theirs } = conflict

  const chosen = await dialogs.choose({
    title: `${target} changed on disk`,
    message: `Someone saved ${target} while you were editing it, so your unsaved changes no longer apply to what is stored.`,
    choices: RESOLUTIONS,
  })

  if (chosen === TAKE_THEIRS) {
    takeTheirs(theirs)

    return true
  }

  if (chosen === KEEP_MINE) {
    await keepMine()

    return true
  }

  if (chosen !== KEEP_BOTH) return false

  return await keepBoth(options, conflict)
}

export const TestOnly = { KEEP_BOTH, KEEP_MINE, TAKE_THEIRS, copyNameFor }
