'use sanity'

import { givenAsync } from '../../../conditions.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { bindFileDrops, TestOnly } from '../../../../src/client/editor/drops.ts'
import { FilesRequestError, type FilesClient } from '../../../../src/client/files/files-client.ts'
import type { Dialogs } from '../../../../src/client/files/dialogs.ts'
import type { Toast } from '../../../../src/client/toast.ts'

import { cast } from '../../../cast.ts'

const { insertionFor, receive, suggestedName } = TestOnly

interface Prompted {
  title: string
  value: string
}

let inserted: Array<{ text: string; at: number | null }> = []
let errors: string[] = []
let prompted: Prompted[] = []
let upload = vi.fn()
let insertion: PromiseWithResolvers<void> = Promise.withResolvers()
let prompting: PromiseWithResolvers<void> = Promise.withResolvers()

interface DropOptions {
  answerPrompt?: (submit: (name: string) => Promise<string | null>) => Promise<boolean>
  atLineStart?: boolean
  at?: number | null
  holder?: () => string | null
}

function declinePrompt(): Promise<boolean> {
  return Promise.resolve(false)
}

const AT_CARET = 3

function dropOptions(options: DropOptions = {}): Parameters<typeof receive>[3] {
  return {
    holder: options.holder ?? (() => 'journal/notes.md'),
    client: cast<FilesClient>({ upload }),
    dialogs: cast<Dialogs>({
      prompt: async (request: { title: string; value?: string; submit: (name: string) => Promise<string | null> }) => {
        prompted.push({ title: request.title, value: request.value ?? '' })

        const answer = options.answerPrompt ?? declinePrompt
        const chosen = await answer(request.submit)
        prompting.resolve()

        return chosen
      },
    }),
    toast: cast<Toast>({
      show: () => undefined,
      error: (message: string) => {
        errors.push(message)
      },
    }),
    insert: (text: string, at: number | null) => {
      inserted.push({ text, at })
      insertion.resolve()
    },
  }
}

function editor(options: DropOptions = {}): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)

  bindFileDrops(
    element,
    () => options.at ?? AT_CARET,
    () => options.atLineStart ?? false,
    dropOptions(options),
  )

  return element
}

async function afterInserting(): Promise<void> {
  await insertion.promise
}

async function afterPrompting(): Promise<void> {
  await prompting.promise
}

function dropFiles(element: HTMLElement, files: File[]): DragEvent {
  const event = cast<DragEvent>(new Event('drop', { bubbles: true, cancelable: true }))
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files, getData: () => '' },
    configurable: true,
  })
  element.dispatchEvent(event)

  return event
}

function png(name: string): File {
  return new File(['x'], name)
}

beforeEach(() => {
  document.body.innerHTML = ''
  inserted = []
  errors = []
  prompted = []
  insertion = Promise.withResolvers()
  prompting = Promise.withResolvers()
  upload = vi.fn().mockImplementation((directory: string, file: File) => Promise.resolve(`${directory}/${file.name}`))
})

describe('where a dropped file lands', () => {
  it('uploads beside the open document, not beside the tree selection', async () => {
    const element = editor()

    dropFiles(element, [png('a.png')])

    await afterInserting()

    expect(upload).toHaveBeenCalledWith('journal', expect.any(File))
  })

  it('inserts an embed for the stored image', async () => {
    const element = editor()

    dropFiles(element, [png('a.png')])

    await afterInserting()

    expect(inserted).toStrictEqual([{ text: '![a.png](a.png)', at: 3 }])
  })

  it('inserts a link for a stored document', async () => {
    const element = editor()

    dropFiles(element, [png('notes.txt')])

    await afterInserting()

    expect(inserted).toStrictEqual([{ text: '[notes.txt](notes.txt)', at: 3 }])
  })
})

describe('several files at once', () => {
  it('uploads them one at a time, so a refusal does not discard the rest', async () => {
    const element = editor()
    const order: string[] = []
    upload.mockImplementation(async (directory: string, file: File) => {
      order.push(`start ${file.name}`)
      await Promise.resolve()
      order.push(`done ${file.name}`)

      return `${directory}/${file.name}`
    })

    dropFiles(element, [png('a.png'), png('b.png')])

    await afterInserting()

    expect(order).toStrictEqual(['start a.png', 'done a.png', 'start b.png', 'done b.png'])
  })

  it('breaks the line first when the drop lands mid-line', async () => {
    const element = editor({ atLineStart: false })

    dropFiles(element, [png('a.png'), png('b.png')])

    await afterInserting()

    expect(inserted.at(0)?.text).toBe('\n![a.png](a.png)\n![b.png](b.png)')
  })

  it('does not break the line when the drop is already at one', async () => {
    const element = editor({ atLineStart: true })

    dropFiles(element, [png('a.png'), png('b.png')])

    await afterInserting()

    expect(inserted.at(0)?.text).toBe('![a.png](a.png)\n![b.png](b.png)')
  })

  it('keeps the files that did upload when one is refused', async () => {
    const element = editor()
    upload.mockImplementation((directory: string, file: File) =>
      file.name === 'bad.png'
        ? Promise.reject(new FilesRequestError(400, 'Content does not match', 'CONTENT_MISMATCH', []))
        : Promise.resolve(`${directory}/${file.name}`),
    )

    dropFiles(element, [png('bad.png'), png('good.png')])

    await afterInserting()

    expect(inserted).toStrictEqual([{ text: '![good.png](good.png)', at: 3 }])
  })

  it('reports the file that was refused, so the gap in the links is explained', async () => {
    const element = editor()
    upload.mockImplementation((directory: string, file: File) =>
      file.name === 'bad.png'
        ? Promise.reject(new FilesRequestError(400, 'Content does not match', 'CONTENT_MISMATCH', []))
        : Promise.resolve(`${directory}/${file.name}`),
    )

    dropFiles(element, [png('bad.png'), png('good.png')])

    await afterInserting()

    expect(errors).toStrictEqual(['bad.png: Content does not match'])
  })
})

describe('a drop whose whole outcome is silence, so the work itself is the only signal', () => {
  it('inserts nothing when every file was refused', async () => {
    upload.mockRejectedValue(new FilesRequestError(400, 'nope', 'CONTENT_MISMATCH', []))

    await receive([png('a.png')], AT_CARET, () => false, dropOptions())

    expect(inserted).toStrictEqual([])
  })
})

describe('a name that is already taken', () => {
  function collides(): void {
    upload.mockRejectedValueOnce(new FilesRequestError(409, 'Already exists', 'ALREADY_EXISTS', []))
  }

  it('offers a different name rather than failing silently', async () => {
    const element = editor()
    collides()

    dropFiles(element, [png('a.png')])

    await afterPrompting()

    expect(prompted).toStrictEqual([{ title: 'a.png is already there', value: 'a-1.png' }])
  })

  it('links what it stored under the chosen name', async () => {
    const element = editor({
      answerPrompt: async (submit) => {
        await givenAsync(expect(submit('renamed.png')).resolves.toBeNull())

        return true
      },
    })
    collides()
    upload.mockImplementation((directory: string, _file: File, filename: string) =>
      Promise.resolve(`${directory}/${filename}`),
    )

    dropFiles(element, [png('a.png')])

    await afterInserting()

    expect(inserted).toStrictEqual([{ text: '![renamed.png](renamed.png)', at: 3 }])
  })

  it('links the file already in the store when the rename is declined', async () => {
    const element = editor()
    collides()

    dropFiles(element, [png('a.png')])

    await afterInserting()

    expect(inserted).toStrictEqual([{ text: '![a.png](a.png)', at: 3 }])
  })

  it('reports a rename the server also refused, so the dialog can stay open', async () => {
    let reported: string | null = 'not asked'
    const element = editor({
      answerPrompt: async (submit) => {
        reported = await submit('still-taken.png')

        return false
      },
    })
    collides()
    upload.mockRejectedValueOnce(new FilesRequestError(409, 'Already exists', 'ALREADY_EXISTS', []))

    dropFiles(element, [png('a.png')])

    await afterPrompting()

    expect(reported).toBe('Already exists')
  })
})

describe('a drag that is not carrying files', () => {
  it('is left alone, so a tree drag still inserts a link', () => {
    const element = editor()
    const event = cast<DragEvent>(new Event('drop', { bubbles: true, cancelable: true }))
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['application/x-vixen-path'], files: [], getData: () => '' },
      configurable: true,
    })

    element.dispatchEvent(event)

    expect({ prevented: event.defaultPrevented, inserted }).toStrictEqual({ prevented: false, inserted: [] })
  })

  it('takes dragover for a file drag, without which no drop arrives', () => {
    const element = editor()
    const event = cast<DragEvent>(new Event('dragover', { bubbles: true, cancelable: true }))
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['Files'], files: [], getData: () => '' },
      configurable: true,
    })

    element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores a drop carrying no transfer, which the type allows', () => {
    const element = editor()
    const event = cast<DragEvent>(new Event('drop', { bubbles: true, cancelable: true }))
    Object.defineProperty(event, 'dataTransfer', { value: null, configurable: true })

    element.dispatchEvent(event)

    expect({ prevented: event.defaultPrevented, inserted }).toStrictEqual({ prevented: false, inserted: [] })
  })
})

describe('the name suggested on a collision', () => {
  it.each([
    ['photo.png', 'photo-1.png'],
    ['notes.md', 'notes-1.md'],
    ['archive.tar.gz', 'archive.tar-1.gz'],
    ['README', 'README-1'],
  ])('suggests %s as %s', (name, expected) => {
    expect(suggestedName(name)).toBe(expected)
  })
})

describe('how several links are laid out', () => {
  it('leaves one link inline wherever it was dropped', () => {
    expect(insertionFor(['[a](a)'], false)).toBe('[a](a)')
  })

  it('never breaks the line for a single link, even mid-line', () => {
    expect(insertionFor(['[a](a)'], false)).not.toContain('\n')
  })
})

describe('dragover carrying something other than files', () => {
  it('is left to the browser, so a tree drag keeps its own handler', () => {
    const element = editor()
    const event = cast<DragEvent>(new Event('dragover', { bubbles: true, cancelable: true }))
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['application/x-vixen-path'], files: [], getData: () => '' },
      configurable: true,
    })

    element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})

describe('dropping a file onto an editor that holds no document', () => {
  it('uploads nothing, because there is no directory for it to land beside', async () => {
    const element = editor({ holder: () => null })

    dropFiles(element, [new File(['x'], 'photo.png', { type: 'image/png' })])
    await Promise.resolve()

    expect(upload).not.toHaveBeenCalled()
  })
})
