'use sanity'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createPaneWorkspace } from '../../../src/client/editor/pane-workspace.ts'
import { createPreviews } from '../../../src/client/editor/previews.ts'
import { createToast, type Toast } from '../../../src/client/toast.ts'
import type { Session } from '../../../src/client/editor/session.ts'
import type { FilesClient } from '../../../src/client/files/files-client.ts'
import {
  dialogsDismissing,
  filesAnsweringEmpty,
  recorded,
  sessionRecording,
  type Recorded,
} from '../editor-fixtures.ts'
import { renderPane } from '../templates.ts'
import { cast } from '../../cast.ts'
import { DRAG_MIME } from '../../../src/client/drag-payload.ts'

const SOMETHING_STORED = '# stored'
const WHENEVER = '2026-01-01T00:00:00.000Z'

let root: HTMLElement = document.createElement('div')
let element: HTMLElement = document.createElement('div')
let record: Recorded = recorded()
let standing: Array<() => void> = []

let rereads = 0

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, {
    load: () => Promise.resolve({ content: SOMETHING_STORED, stored: true }),
    reread: () => {
      rereads += 1

      return Promise.resolve(null)
    },
    ...overrides,
  })
}

function paneHolding(
  holds: string | null,
  answering: Partial<FilesClient> = {},
  session: Partial<Session> = {},
  complaining: Partial<Toast> = {},
): ReturnType<typeof createPaneWorkspace> {
  const built = createPaneWorkspace({
    root,
    element,
    id: 'secondary',
    holds,
    session: fakeSession(session),
    files: { ...filesAnsweringEmpty(), ...answering },
    dialogs: dialogsDismissing(),
    toast: { ...createToast(root), ...complaining },
    previews: createPreviews(() => undefined),
    openUrl: () => undefined,
    reopen: () => undefined,
    announce: () => undefined,
    onActivate: () => undefined,
    onCloseRequested: () => undefined,
    onTabArrived: () => undefined,
    onShowing: () => undefined,
    releaseElsewhere: () => Promise.resolve(),
  })
  standing.push(built.teardownDocument)

  return built
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  rereads = 0
  document.body.innerHTML = ''
  root = document.createElement('div')
  element = document.createElement('section')
  element.innerHTML = renderPane()
  root.append(element)
  document.body.append(root)
})

afterEach(() => {
  for (const release of standing) release()
  standing = []
})

describe('a pane that was given nothing to hold', () => {
  it('holds no document, rather than the one the page was opened on', () => {
    const pane = paneHolding(null)

    expect(pane.held.path()).toBeNull()
  })

  it('writes nothing when its editor is typed into, so it cannot overwrite a document', async () => {
    const pane = paneHolding(null)
    const { view } = pane.editor()

    view.dispatch({ changes: { from: 0, insert: 'junk from an empty pane' } })
    await pane.flush()

    expect(record.saved).toStrictEqual([])
  })
})

describe('a pane that was given a document', () => {
  it('holds it, so the pane it belongs to can save it', () => {
    const pane = paneHolding('notes.md')

    expect(pane.held.path()).toBe('notes.md')
  })

  it('writes what was typed, because it knows where it goes', async () => {
    const pane = paneHolding('notes.md')
    const { view } = pane.editor()

    view.dispatch({ changes: { from: 0, insert: 'real work' } })
    await pane.flush()

    expect(record.saved.map(({ id }) => id)).toStrictEqual(['notes.md'])
  })
})

describe('a pane whose document has left it', () => {
  async function emptied(): Promise<ReturnType<typeof createPaneWorkspace>> {
    const pane = paneHolding('notes.md')
    await pane.showDocument('notes.md')
    await pane.leave()

    return pane
  }

  it('asks the server about nothing, because it holds nothing', async () => {
    const pane = await emptied()
    rereads = 0

    await pane.editor().recheck()

    expect(rereads).toBe(0)
  })

  it('writes nothing when asked to save', async () => {
    const pane = await emptied()
    const { view } = pane.editor()
    view.dispatch({ changes: { from: 0, insert: 'typed after leaving' } })

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    await pane.flush()

    expect(record.saved).toStrictEqual([])
  })
})

describe('what a pane shows when it is not showing an editor', () => {
  function tabsShown(): Array<string | undefined> {
    return [...element.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => tab.dataset.tab)
  }

  it('gives an image a tab, so the reader has a handle on what they are looking at', async () => {
    const pane = paneHolding(null)

    await pane.openPath('/doc/photo.png')

    expect(tabsShown()).toStrictEqual(['image:photo.png'])
  })

  it('gives a missing document a tab', async () => {
    const pane = paneHolding(null, {}, { load: () => Promise.resolve({ content: '', stored: false }) })

    await pane.openPath('/doc/gone.md')

    expect(tabsShown()).toStrictEqual(['missing:gone.md'])
  })

  it('gives a trash entry a tab naming the document it was', async () => {
    const trashed = { id: 'entry-1', originalPath: 'journal/a.md', kind: 'document' as const, deletedAt: WHENEVER }
    const pane = paneHolding(null, { trash: () => Promise.resolve([trashed]) })

    await pane.openPath('/trash/entry-1')

    expect(tabsShown()).toStrictEqual(['deleted:journal/a.md'])
  })

  it('leaves the strip empty when the pane has been given nothing to show', () => {
    paneHolding(null)

    expect(tabsShown()).toStrictEqual([])
  })
})

describe('a pane told to show an image without a url to classify it', () => {
  it('shows the image, because an image is not a document whichever way the pane was told to show it', async () => {
    const pane = paneHolding(null)
    await pane.showDocument('photo.png')

    element.querySelector('[data-part="image-file"]')?.dispatchEvent(new Event('load'))

    expect(element.querySelector<HTMLElement>('[data-part="view-image"]')?.hidden).toBe(false)
  })

  it('never asks the documents api for it, which refuses an image with a 400 rather than a 404', async () => {
    const asked: string[] = []
    const pane = paneHolding(
      null,
      {},
      {
        load: (id: string) => {
          asked.push(id)

          return Promise.resolve({ content: SOMETHING_STORED, stored: true })
        },
      },
    )

    await pane.showDocument('photo.png')

    expect(asked).toStrictEqual([])
  })
})

describe('a pane released without being asked to settle first', () => {
  it('lets go of the document it held, so nothing it no longer shows can be written back', async () => {
    const pane = paneHolding('notes.md')
    await pane.showDocument('notes.md')

    pane.release()

    expect(pane.held.path()).toBeNull()
  })
})

describe('dropping onto a pane that is showing a preview', () => {
  function dropOnTheMarkupView(dataTransfer: DataTransfer): void {
    element
      .querySelector<HTMLElement>('[data-part="view-markup"]')
      ?.dispatchEvent(
        cast<Event>(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer })),
      )
  }

  it('opens what was dragged from the file browser, rather than swallowing the gesture', async () => {
    const opened: PromiseWithResolvers<string> = Promise.withResolvers()
    const pane = paneHolding(
      'notes.md',
      {},
      {
        load: (id: string) => {
          if (id === 'journal/a.md') opened.resolve(id)

          return Promise.resolve({ content: SOMETHING_STORED, stored: true })
        },
      },
    )
    await pane.showDocument('notes.md')

    dropOnTheMarkupView(
      cast<DataTransfer>({
        getData: (mime: string) => (mime === DRAG_MIME ? 'journal/a.md' : 'document'),
        types: [DRAG_MIME],
      }),
    )

    await expect(opened.promise).resolves.toBe('journal/a.md')
  })

  it('uploads a dropped file beside the document the pane is showing', async () => {
    const landed: PromiseWithResolvers<string> = Promise.withResolvers()
    const pane = paneHolding('journal/notes.md', {
      upload: (directory: string, file: File) => {
        landed.resolve(`${directory}:${file.name}`)

        return Promise.resolve(`${directory}/${file.name}`)
      },
    })
    await pane.showDocument('journal/notes.md')

    dropOnTheMarkupView(cast<DataTransfer>({ getData: () => '', types: ['Files'], files: [new File(['x'], 'p.png')] }))

    await expect(landed.promise).resolves.toBe('journal:p.png')
  })

  it('uploads nothing when the pane is on no tab, because there is no file to be a sibling of', async () => {
    const asked: string[] = []
    const pane = paneHolding('journal/notes.md', {
      upload: (directory: string) => {
        asked.push(directory)

        return Promise.resolve(`${directory}/p.png`)
      },
    })
    await pane.leave()

    dropOnTheMarkupView(cast<DataTransfer>({ getData: () => '', types: ['Files'], files: [new File(['x'], 'p.png')] }))

    expect(asked).toStrictEqual([])
  })

  it('says why when the store refuses the upload, and opens nothing in its place', async () => {
    const complained: PromiseWithResolvers<string> = Promise.withResolvers()
    const pane = paneHolding(
      'journal/notes.md',
      { upload: () => Promise.reject(new Error('the store refused')) },
      {},
      {
        error: (message: string) => {
          complained.resolve(message)

          return cast<ReturnType<Toast['error']>>({ dismiss: () => undefined })
        },
      },
    )
    await pane.showDocument('journal/notes.md')

    dropOnTheMarkupView(cast<DataTransfer>({ getData: () => '', types: ['Files'], files: [new File(['x'], 'p.png')] }))

    await expect(complained.promise).resolves.toBe('p.png: the store refused')
  })
})
