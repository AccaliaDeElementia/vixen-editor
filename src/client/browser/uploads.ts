'use sanity'

import { joinPath } from '../../shared/store-path.ts'
import { serially } from '../../shared/serially.ts'
import { errorMessage } from '../platform/error-message.ts'
import type { Dialogs } from '../platform/dialogs.ts'
import type { Toast } from '../platform/toast.ts'

import { FilesRequestError, type FilesClient } from './files-client.ts'

const ALREADY_EXISTS = 'ALREADY_EXISTS'
const SUGGESTED_SUFFIX = '-1'
const NOTHING_STORED = 0
const FIRST_CHARACTER = 0

export interface Uploading {
  client: FilesClient
  dialogs: Dialogs
  toast: Toast
  announce: () => void
}

function suggestedName(filename: string): string {
  const dot = filename.lastIndexOf('.')

  return dot <= FIRST_CHARACTER
    ? `${filename}${SUGGESTED_SUFFIX}`
    : `${filename.slice(FIRST_CHARACTER, dot)}${SUGGESTED_SUFFIX}${filename.slice(dot)}`
}

function collided(error: unknown): boolean {
  return error instanceof FilesRequestError && error.code === ALREADY_EXISTS
}

async function resolveCollision(file: File, directory: string, options: Uploading): Promise<string | null> {
  let stored: string | null = joinPath(directory, file.name)

  const renamed = await options.dialogs.prompt({
    title: `${file.name} is already there`,
    label: 'New name',
    value: suggestedName(file.name),
    confirmLabel: 'Upload under this name',
    submit: async (name: string) => {
      try {
        stored = await options.client.upload(directory, file, name)

        return null
      } catch (error) {
        return errorMessage(error)
      }
    },
  })

  return renamed ? stored : joinPath(directory, file.name)
}

async function storeOne(file: File, directory: string, options: Uploading): Promise<string | null> {
  try {
    return await options.client.upload(directory, file)
  } catch (error) {
    if (!collided(error)) {
      options.toast.error(`${file.name}: ${errorMessage(error)}`)

      return null
    }
  }

  return await resolveCollision(file, directory, options)
}

export async function uploadInto(files: readonly File[], directory: string, options: Uploading): Promise<string[]> {
  const stored: string[] = []

  await serially(files, async (file) => {
    const landed = await storeOne(file, directory, options)
    if (landed !== null) stored.push(landed)
  })

  if (stored.length > NOTHING_STORED) options.announce()

  return stored
}

export const TestOnly = { suggestedName }
