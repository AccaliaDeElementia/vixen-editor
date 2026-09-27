'use sanity'

import { describe, expect, it, vi } from 'vitest'

import { DocumentRequestError } from '../../src/client/editor/document-client.ts'
import { isConflict, offerResolution, TestOnly } from '../../src/client/editor/conflict.ts'
import type { ConflictOptions } from '../../src/client/editor/conflict.ts'
import type { Dialogs } from '../../src/client/files/dialogs.ts'
import type { FilesClient } from '../../src/client/files/files-client.ts'
import { cast } from '../cast.ts'

const { KEEP_BOTH, KEEP_MINE, MERGE, TAKE_THEIRS, copyNameFor } = TestOnly

const CONFLICT = { target: 'journal/notes.md', theirs: '# theirs', mine: '# mine' }

interface ChoiceOffer {
  title: string
  message: string
  choices: ReadonlyArray<{ value: string; label: string }>
}

interface Harness {
  options: ConflictOptions
  offers: ChoiceOffer[]
  createDocument: ReturnType<typeof vi.fn<(entryPath: string, content?: string) => Promise<void>>>
  takeTheirs: ReturnType<typeof vi.fn<(content: string) => void>>
  keepMine: ReturnType<typeof vi.fn<() => Promise<void>>>
  merge: ReturnType<typeof vi.fn<(onDisk: string) => void>>
  announced: string[]
}

function harness(chosen: string | null, accepted = true): Harness {
  const announced: string[] = []
  const offers: ChoiceOffer[] = []
  const choose = (request: ChoiceOffer): Promise<string | null> => {
    offers.push(request)

    return Promise.resolve(chosen)
  }
  const prompt = async (request: { submit: (value: string) => Promise<string | null> }): Promise<boolean> => {
    if (!accepted) return false

    return (await request.submit(copyNameFor(CONFLICT.target))) === null
  }
  const createDocument = vi.fn<(entryPath: string, content?: string) => Promise<void>>().mockResolvedValue(undefined)
  const takeTheirs = vi.fn<(content: string) => void>()
  const keepMine = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const merge = vi.fn<(onDisk: string) => void>()

  return {
    offers,
    createDocument,
    takeTheirs,
    keepMine,
    merge,
    announced,
    options: {
      dialogs: cast<Dialogs>({ choose, prompt }),
      files: cast<FilesClient>({ createDocument }),
      takeTheirs,
      keepMine,
      merge,
      announce: (text: string) => {
        announced.push(text)
      },
    },
  }
}

describe('offering the three resolutions', () => {
  it('names the document that changed, so the choice is not made blind', async () => {
    const { options, offers } = harness(null)

    await offerResolution(options, CONFLICT)

    expect(offers[0]?.title).toContain('journal/notes.md')
  })

  it('offers all four resolutions', async () => {
    const { options, offers } = harness(null)

    await offerResolution(options, CONFLICT)

    expect(offers[0]?.choices.map((choice) => choice.value)).toStrictEqual([TAKE_THEIRS, KEEP_MINE, KEEP_BOTH, MERGE])
  })
})

describe('take theirs', () => {
  it('loads the version on disk into the buffer', async () => {
    const { options, takeTheirs } = harness(TAKE_THEIRS)

    await offerResolution(options, CONFLICT)

    expect(takeTheirs).toHaveBeenCalledWith('# theirs')
  })

  it('reports itself resolved, so the caller does not also warn', async () => {
    const { options } = harness(TAKE_THEIRS)

    await expect(offerResolution(options, CONFLICT)).resolves.toBe(true)
  })

  it('does not write anything to the store', async () => {
    const { options, createDocument, keepMine } = harness(TAKE_THEIRS)

    await offerResolution(options, CONFLICT)

    expect(createDocument).not.toHaveBeenCalled()
    expect(keepMine).not.toHaveBeenCalled()
  })
})

describe('keep mine', () => {
  it('saves again, which now carries the token the check returned', async () => {
    const { options, keepMine } = harness(KEEP_MINE)

    await expect(offerResolution(options, CONFLICT)).resolves.toBe(true)
    expect(keepMine).toHaveBeenCalledTimes(1)
  })

  it('leaves the buffer alone, since the buffer is what is being kept', async () => {
    const { options, takeTheirs } = harness(KEEP_MINE)

    await offerResolution(options, CONFLICT)

    expect(takeTheirs).not.toHaveBeenCalled()
  })
})

describe('keep both', () => {
  it('creates a second document holding the buffer', async () => {
    const { options, createDocument } = harness(KEEP_BOTH)

    await offerResolution(options, CONFLICT)

    expect(createDocument).toHaveBeenCalledWith('journal/notes-mine.md', '# mine')
  })

  it('suggests a name beside the original, keeping the extension', () => {
    expect(copyNameFor('journal/notes.md')).toBe('journal/notes-mine.md')
    expect(copyNameFor('notes.txt')).toBe('notes-mine.txt')
    expect(copyNameFor('README')).toBe('README-mine')
  })

  it('then loads the version on disk, so the open document is no longer stale', async () => {
    const { options, takeTheirs } = harness(KEEP_BOTH)

    await offerResolution(options, CONFLICT)

    expect(takeTheirs).toHaveBeenCalledWith('# theirs')
  })

  it('says where the copy went, or the work looks lost', async () => {
    const { options, announced } = harness(KEEP_BOTH)

    await offerResolution(options, CONFLICT)

    expect(announced.join(' ')).toContain('journal/notes-mine.md')
  })

  it('hands the rejection back to the dialog so the name can be corrected', async () => {
    const { options, createDocument } = harness(KEEP_BOTH)
    createDocument.mockRejectedValue(new DocumentRequestError(409, 'Already exists'))

    await expect(offerResolution(options, CONFLICT)).resolves.toBe(false)
  })

  it('leaves the buffer alone when the copy is abandoned', async () => {
    const { options, takeTheirs } = harness(KEEP_BOTH, false)

    await expect(offerResolution(options, CONFLICT)).resolves.toBe(false)
    expect(takeTheirs).not.toHaveBeenCalled()
  })
})

describe('merge', () => {
  it('hands the stored version over to be diffed against the buffer', async () => {
    const { options, merge } = harness(MERGE)

    await expect(offerResolution(options, CONFLICT)).resolves.toBe(true)
    expect(merge).toHaveBeenCalledWith('# theirs')
  })

  it('leaves the buffer and the store alone, because the user resolves it change by change', async () => {
    const { options, takeTheirs, keepMine, createDocument } = harness(MERGE)

    await offerResolution(options, CONFLICT)

    expect(takeTheirs).not.toHaveBeenCalled()
    expect(keepMine).not.toHaveBeenCalled()
    expect(createDocument).not.toHaveBeenCalled()
  })
})

describe('dismissing the choice', () => {
  it('changes nothing and reports itself unresolved', async () => {
    const { options, takeTheirs, keepMine, createDocument, merge } = harness(null)

    await expect(offerResolution(options, CONFLICT)).resolves.toBe(false)
    expect(takeTheirs).not.toHaveBeenCalled()
    expect(keepMine).not.toHaveBeenCalled()
    expect(createDocument).not.toHaveBeenCalled()
    expect(merge).not.toHaveBeenCalled()
  })
})

describe('isConflict', () => {
  it('is true only for the status the store answers a stale token with', () => {
    expect(isConflict(new DocumentRequestError(412, 'Conflict'))).toBe(true)
    expect(isConflict(new DocumentRequestError(503, 'Busy'))).toBe(false)
    expect(isConflict(new DocumentRequestError(404, 'Gone'))).toBe(false)
  })

  it('is false for anything that never reached the store', () => {
    expect(isConflict(new Error('network down'))).toBe(false)
    expect(isConflict(null)).toBe(false)
  })
})
