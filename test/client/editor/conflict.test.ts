'use sanity'

import { describe, expect, it, vi } from 'vitest'

import { DocumentRequestError } from '../../../src/client/editor/document-client.ts'
import { isConflict, offerResolution, TestOnly } from '../../../src/client/editor/conflict.ts'
import type { ConflictOptions } from '../../../src/client/editor/conflict.ts'
import type { Dialogs } from '../../../src/client/files/dialogs.ts'
import type { FilesClient } from '../../../src/client/files/files-client.ts'
import { cast } from '../../cast.ts'

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

function effectsOf(harnessed: Harness): Record<string, number> {
  return {
    tookTheirs: harnessed.takeTheirs.mock.calls.length,
    keptMine: harnessed.keepMine.mock.calls.length,
    created: harnessed.createDocument.mock.calls.length,
    merged: harnessed.merge.mock.calls.length,
  }
}

const NO_EFFECTS = { tookTheirs: 0, keptMine: 0, created: 0, merged: 0 }

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

  it('changes the buffer and nothing else, writing nothing to the store', async () => {
    const harnessed = harness(TAKE_THEIRS)

    await offerResolution(harnessed.options, CONFLICT)

    expect(effectsOf(harnessed)).toStrictEqual({ ...NO_EFFECTS, tookTheirs: 1 })
  })
})

describe('keep mine', () => {
  it('saves again, which now carries the token the check returned', async () => {
    const { options, keepMine } = harness(KEEP_MINE)

    await offerResolution(options, CONFLICT)

    expect(keepMine).toHaveBeenCalledTimes(1)
  })

  it('reports itself resolved, so the caller does not also warn', async () => {
    const { options } = harness(KEEP_MINE)

    await expect(offerResolution(options, CONFLICT)).resolves.toBe(true)
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

  it.each([
    ['journal/notes.md', 'journal/notes-mine.md'],
    ['notes.txt', 'notes-mine.txt'],
    ['README', 'README-mine'],
  ])('suggests a name beside %s, keeping the extension', (original, expected) => {
    expect(copyNameFor(original)).toBe(expected)
  })

  it('reports itself resolved, so the caller does not also warn', async () => {
    const { options } = harness(KEEP_BOTH)

    await expect(offerResolution(options, CONFLICT)).resolves.toBe(true)
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

  it('reports itself unresolved when the copy is abandoned', async () => {
    const { options } = harness(KEEP_BOTH, false)

    await expect(offerResolution(options, CONFLICT)).resolves.toBe(false)
  })

  it('leaves the buffer alone when the copy is abandoned', async () => {
    const harnessed = harness(KEEP_BOTH, false)

    await offerResolution(harnessed.options, CONFLICT)

    expect(effectsOf(harnessed)).toStrictEqual(NO_EFFECTS)
  })
})

describe('merge', () => {
  it('hands the stored version over to be diffed against the buffer', async () => {
    const { options, merge } = harness(MERGE)

    await offerResolution(options, CONFLICT)

    expect(merge).toHaveBeenCalledWith('# theirs')
  })

  it('reports itself resolved, so the caller does not also warn', async () => {
    const { options } = harness(MERGE)

    await expect(offerResolution(options, CONFLICT)).resolves.toBe(true)
  })

  it('leaves the buffer and the store alone, because the user resolves it change by change', async () => {
    const harnessed = harness(MERGE)

    await offerResolution(harnessed.options, CONFLICT)

    expect(effectsOf(harnessed)).toStrictEqual({ ...NO_EFFECTS, merged: 1 })
  })
})

describe('dismissing the choice', () => {
  it('reports itself unresolved', async () => {
    const { options } = harness(null)

    await expect(offerResolution(options, CONFLICT)).resolves.toBe(false)
  })

  it('changes nothing', async () => {
    const harnessed = harness(null)

    await offerResolution(harnessed.options, CONFLICT)

    expect(effectsOf(harnessed)).toStrictEqual(NO_EFFECTS)
  })
})

describe('isConflict', () => {
  it.each([
    ['a stale token', 412, 'Conflict', true],
    ['a busy store', 503, 'Busy', false],
    ['a document that is gone', 404, 'Gone', false],
  ])('treats %s as a conflict: %s', (_label, status, message, expected) => {
    expect(isConflict(new DocumentRequestError(status, message))).toBe(expected)
  })

  it.each([
    ['a network failure', new Error('network down')],
    ['nothing at all', null],
  ])('is false for %s, which never reached the store', (_label, thrown) => {
    expect(isConflict(thrown)).toBe(false)
  })
})
