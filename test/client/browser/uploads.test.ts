'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { TestOnly, uploadInto, type Uploading } from '../../../src/client/browser/uploads.ts'
import { FilesRequestError, type FilesClient } from '../../../src/client/browser/files-client.ts'
import type { Dialogs } from '../../../src/client/platform/dialogs.ts'
import type { Toast } from '../../../src/client/platform/toast.ts'

import { cast } from '../../cast.ts'

const { suggestedName } = TestOnly

type Prompting = Parameters<Dialogs['prompt']>[0]

const HERE = 'journal'

let refusals: string[] = []
let announcements = 0
let prompted: string[] = []

function collision(): FilesRequestError {
  return new FilesRequestError(409, 'Already exists', 'ALREADY_EXISTS')
}

interface Driving {
  upload?: FilesClient['upload']
  renaming?: boolean
}

function uploading({ upload = () => Promise.resolve('journal/photo.png'), renaming = false }: Driving = {}): Uploading {
  return {
    client: cast<FilesClient>({ upload }),
    dialogs: cast<Dialogs>({
      prompt: async (request: Prompting) => {
        prompted.push(request.title)
        if (!renaming) return await Promise.resolve(false)
        await request.submit(request.value ?? '')

        return true
      },
    }),
    toast: cast<Toast>({
      error: (message: string) => {
        refusals.push(message)

        return cast<ReturnType<Toast['error']>>({ dismiss: () => undefined })
      },
    }),
    announce: () => {
      announcements += 1
    },
  }
}

function photo(): File {
  return new File(['x'], 'photo.png')
}

beforeEach(() => {
  refusals = []
  announcements = 0
  prompted = []
})

describe('the name suggested on a collision', () => {
  it.each([
    ['photo.png', 'photo-1.png'],
    ['notes.md', 'notes-1.md'],
    ['archive.tar.gz', 'archive.tar-1.gz'],
    ['README', 'README-1'],
    ['.gitignore', '.gitignore-1'],
  ])('suggests %s as %s', (name, expected) => {
    expect(suggestedName(name)).toBe(expected)
  })
})

describe('uploading files into a folder', () => {
  it('hands back where each one landed', async () => {
    await expect(uploadInto([photo()], HERE, uploading())).resolves.toStrictEqual(['journal/photo.png'])
  })

  it('says so once something landed, which is what the reader is told', async () => {
    await uploadInto([photo()], HERE, uploading())

    expect(announcements).toBe(1)
  })

  it('says nothing when there was nothing to upload', async () => {
    await uploadInto([], HERE, uploading())

    expect(announcements).toBe(0)
  })
})

describe('an upload the store refused', () => {
  const OFFLINE = { upload: () => Promise.reject(new Error('offline')) }

  it('reports why, rather than leaving the reader guessing', async () => {
    await uploadInto([photo()], HERE, uploading(OFFLINE))

    expect(refusals).toStrictEqual(['photo.png: offline'])
  })

  it('leaves it out of what landed, because nothing did', async () => {
    await expect(uploadInto([photo()], HERE, uploading(OFFLINE))).resolves.toStrictEqual([])
  })

  it('says nothing landed, because nothing did', async () => {
    await uploadInto([photo()], HERE, uploading(OFFLINE))

    expect(announcements).toBe(0)
  })

  it('reports a refusal the store explained, rather than offering to rename', async () => {
    const mismatched = { upload: () => Promise.reject(new FilesRequestError(400, 'not a png', 'CONTENT_MISMATCH')) }

    await uploadInto([photo()], HERE, uploading(mismatched))

    expect(prompted).toStrictEqual([])
  })
})

describe('an upload whose name is already taken', () => {
  const TAKEN = { upload: () => Promise.reject(collision()) }

  it('offers a new name rather than reporting a failure', async () => {
    await uploadInto([photo()], HERE, uploading(TAKEN))

    expect(prompted).toStrictEqual(['photo.png is already there'])
  })

  it('reports nothing to the toast, because the reader is being asked instead', async () => {
    await uploadInto([photo()], HERE, uploading(TAKEN))

    expect(refusals).toStrictEqual([])
  })
})
