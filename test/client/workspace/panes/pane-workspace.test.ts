'use sanity'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createPaneWorkspace } from '../../../../src/client/workspace/panes/pane-workspace.ts'
import { createPreviews } from '../../../../src/client/preview/previews.ts'
import { createCaretMemory } from '../../../../src/client/document/caret-memory.ts'
import { createToast, type Toast } from '../../../../src/client/platform/toast.ts'
import type { Session } from '../../../../src/client/document/session.ts'
import type { FilesClient } from '../../../../src/client/browser/files-client.ts'
import {
  dialogsDismissing,
  filesAnsweringEmpty,
  recorded,
  sessionRecording,
  type Recorded,
} from '../../editor-fixtures.ts'
import { renderPane } from '../../templates.ts'
import { cast } from '../../../cast.ts'
import { DRAG_MIME } from '../../../../src/client/platform/drag-payload.ts'
import { cheatsheet } from '../../../../src/client/platform/help.ts'

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

interface PaneOverrides {
  files?: Partial<FilesClient>
  session?: Partial<Session>
  toast?: Partial<Toast>
  contentOf?: (entryPath: string) => string | null
}

function paneHolding(holds: string | null, overrides: PaneOverrides = {}): ReturnType<typeof createPaneWorkspace> {
  const { files: answering = {}, session = {}, toast: complaining = {}, contentOf = () => null } = overrides
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
    previewControls: () => ({ showMarkup: () => undefined, showSource: () => undefined }),
    openUrl: () => undefined,
    reopen: () => undefined,
    announce: () => undefined,
    onActivate: () => undefined,
    onCloseRequested: () => undefined,
    onTabArrived: () => undefined,
    onShowing: () => undefined,
    contentOf,
    caretMemory: createCaretMemory(),
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

  it('answers that nothing was lost, because it never had an editor to save', async () => {
    expect(await paneHolding(null).flush()).toBe(true)
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

  it('answers that it wrote what it held, so a caller can tell a settled pane from a refused one', async () => {
    const pane = paneHolding('notes.md')
    const { view } = pane.editor()
    view.dispatch({ changes: { from: 0, insert: 'real work' } })

    expect(await pane.flush()).toBe(true)
  })

  it('answers that something was lost when the document could not be written', async () => {
    const refusing = { save: () => Promise.reject(new Error('refused')) }
    const pane = paneHolding('notes.md', { session: refusing })
    const { view } = pane.editor()
    view.dispatch({ changes: { from: 0, insert: 'real work' } })

    expect(await pane.flush()).toBe(false)
  })
})

describe('a pane whose document has left it', () => {
  async function emptied(): Promise<ReturnType<typeof createPaneWorkspace>> {
    const pane = paneHolding('notes.md')
    await pane.showDocument('notes.md')
    pane.release()
    pane.pane.leave()

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
    const pane = paneHolding(null, { session: { load: () => Promise.resolve({ content: '', stored: false }) } })

    await pane.openPath('/doc/gone.md')

    expect(tabsShown()).toStrictEqual(['missing:gone.md'])
  })

  it('gives a trash entry a tab naming the document it was', async () => {
    const trashed = { id: 'entry-1', originalPath: 'journal/a.md', kind: 'document' as const, deletedAt: WHENEVER }
    const pane = paneHolding(null, { files: { trash: () => Promise.resolve([trashed]) } })

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
    const pane = paneHolding(null, {
      session: {
        load: (id: string) => {
          asked.push(id)

          return Promise.resolve({ content: SOMETHING_STORED, stored: true })
        },
      },
    })

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
    const pane = paneHolding('notes.md', {
      session: {
        load: (id: string) => {
          if (id === 'journal/a.md') opened.resolve(id)

          return Promise.resolve({ content: SOMETHING_STORED, stored: true })
        },
      },
    })
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
      files: {
        upload: (directory: string, file: File) => {
          landed.resolve(`${directory}:${file.name}`)

          return Promise.resolve(`${directory}/${file.name}`)
        },
      },
    })
    await pane.showDocument('journal/notes.md')

    dropOnTheMarkupView(cast<DataTransfer>({ getData: () => '', types: ['Files'], files: [new File(['x'], 'p.png')] }))

    await expect(landed.promise).resolves.toBe('journal:p.png')
  })

  it('uploads nothing when the pane is on no tab, because there is no file to be a sibling of', () => {
    const asked: string[] = []
    const pane = paneHolding('journal/notes.md', {
      files: {
        upload: (directory: string) => {
          asked.push(directory)

          return Promise.resolve(`${directory}/p.png`)
        },
      },
    })
    pane.pane.leave()

    dropOnTheMarkupView(cast<DataTransfer>({ getData: () => '', types: ['Files'], files: [new File(['x'], 'p.png')] }))

    expect(asked).toStrictEqual([])
  })

  it('says why when the store refuses the upload, and opens nothing in its place', async () => {
    const complained: PromiseWithResolvers<string> = Promise.withResolvers()
    const pane = paneHolding('journal/notes.md', {
      files: { upload: () => Promise.reject(new Error('the store refused')) },
      toast: {
        error: (message: string) => {
          complained.resolve(message)

          return cast<ReturnType<Toast['error']>>({ dismiss: () => undefined })
        },
      },
    })
    await pane.showDocument('journal/notes.md')

    dropOnTheMarkupView(cast<DataTransfer>({ getData: () => '', types: ['Files'], files: [new File(['x'], 'p.png')] }))

    await expect(complained.promise).resolves.toBe('p.png: the store refused')
  })
})

function reasonText(): string {
  return element.querySelector('[data-part="unreachable-reason"]')?.textContent ?? ''
}

describe('a pane that could not reach what it was asked to show', () => {
  const OFFLINE = { load: () => Promise.reject(new Error('offline')) }

  it('names the document, so the reader knows which one is missing', async () => {
    await paneHolding(null, { session: OFFLINE }).showDocument('notes.md')

    expect(reasonText()).toContain('notes.md could not be loaded')
  })

  it('names the store itself when the whole store is what could not be reached', async () => {
    await paneHolding(null, { session: OFFLINE }).showDocument('')

    expect(reasonText()).toContain('The store could not be loaded')
  })

  it('carries why it could not be reached, which is the only part the reader can act on', async () => {
    await paneHolding(null, { session: OFFLINE }).showDocument('notes.md')

    expect(reasonText()).toContain('offline')
  })
})

describe('a pane asked for a document the store already holds', () => {
  it('opens it, rather than offering to create one that is already there', async () => {
    const pane = paneHolding(null)

    await pane.showDocument('notes.md')

    expect(pane.held.path()).toBe('notes.md')
  })
})

describe('where a preview takes its text from', () => {
  it('uses what the pane already holds, so an unsaved edit is what gets previewed', async () => {
    let loads = 0
    const counting = {
      load: (id: string) => {
        loads += 1

        return Promise.resolve({ content: `# ${id}`, stored: true })
      },
    }
    const pane = paneHolding(null, { session: counting, contentOf: () => '# unsaved' })

    await pane.showTab({ path: 'notes.md', view: 'markup' })

    expect(loads).toBe(0)
  })

  it('loads it when the pane is holding nothing for that document', async () => {
    let loads = 0
    const counting = {
      load: (id: string) => {
        loads += 1

        return Promise.resolve({ content: `# ${id}`, stored: true })
      },
    }
    const pane = paneHolding(null, { session: counting })

    await pane.showTab({ path: 'notes.md', view: 'markup' })

    expect(loads).toBe(1)
  })
})

describe('the cheatsheet a brand new store is opened with', () => {
  const NOTHING_STORED = { load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: false }) }

  function contentOfEditor(pane: ReturnType<typeof createPaneWorkspace>): string {
    return pane.editor().view.state.doc.toString()
  }

  it('is offered when the store holds nothing at all, so a first-time reader is not shown a blank page', async () => {
    const pane = paneHolding(null, { files: { tree: () => Promise.resolve([]) }, session: NOTHING_STORED })

    await pane.openPath('/doc/')

    expect(contentOfEditor(pane)).toContain(cheatsheet())
  })

  it('is withheld once the store holds something, because the reader has been here before', async () => {
    const holding = { tree: () => Promise.resolve([{ name: 'a.md', path: 'a.md', kind: 'document' as const }]) }
    const pane = paneHolding(null, { files: holding, session: NOTHING_STORED })

    await pane.openPath('/doc/')

    expect(contentOfEditor(pane)).not.toContain(cheatsheet())
  })

  it('is withheld when the tree could not be read, because nothing says the store is new', async () => {
    const unreadable = { tree: () => Promise.reject(new Error('offline')) }
    const pane = paneHolding(null, { files: unreadable, session: NOTHING_STORED })

    await pane.openPath('/doc/')

    expect(contentOfEditor(pane)).not.toContain(cheatsheet())
  })

  it('is withheld for a new document inside a folder, where it would sit in the reader way', async () => {
    const pane = paneHolding(null, { files: { tree: () => Promise.resolve([]) }, session: NOTHING_STORED })

    await pane.openPath('/doc/journal/')

    expect(contentOfEditor(pane)).not.toContain(cheatsheet())
  })
})

describe('when a pane checks that what it holds is still fresh', () => {
  it('rereads the document it is showing, which is how a change made elsewhere is noticed', async () => {
    const pane = paneHolding('notes.md')
    await pane.showDocument('notes.md')
    rereads = 0

    await pane.editor().recheck()

    expect(rereads).toBe(1)
  })

  it('rereads nothing while a preview is in front, because nothing there is being edited', async () => {
    const pane = paneHolding('notes.md')
    await pane.showDocument('notes.md')
    await pane.showTab({ path: 'notes.md', view: 'markup' })
    rereads = 0

    await pane.editor().recheck()

    expect(rereads).toBe(0)
  })
})
