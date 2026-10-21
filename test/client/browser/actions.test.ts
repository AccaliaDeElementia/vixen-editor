'use sanity'

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { bindActions, updateInsertAvailability } from '../../../src/client/browser/actions.ts'
import { FilesRequestError, type FilesClient } from '../../../src/client/browser/files-client.ts'
import { onDeletionPending } from '../../../src/client/platform/announce/deletion-pending.ts'
import { onEntryTrashed, type TrashedEntry } from '../../../src/client/platform/announce/entry-trashed.ts'
import { archiveUrlFor } from '../../../src/shared/api.ts'
import { STORE_ROOT } from '../../../src/shared/store-path.ts'
import type { Dialogs, NameResolver } from '../../../src/client/platform/dialogs.ts'
import type { Toast } from '../../../src/client/platform/toast.ts'

import { cast } from '../../cast.ts'
import { given } from '../../conditions.ts'
import { renderPage } from '../templates.ts'

const FOLDER = 'journal'
const SELECTED = 'journal/notes.md'
const TYPED = 'typed-name.md'
const TRASH_ID = 'abc'

interface PromptLike {
  submit: (name: string) => Promise<string | null>
  nameFor?: NameResolver | undefined
}

interface Bound {
  selection?: string | null
  directory?: string
  confirmed?: boolean
  dismissed?: boolean
}

let root: ParentNode = document
interface StoreCalls {
  createDocument: Mock<(entryPath: string) => Promise<void>>
  createFolder: Mock<(folderPath: string) => Promise<void>>
  upload: Mock<(directory: string, file: File) => Promise<string>>
  remove: Mock<(entryPath: string) => Promise<string>>
  importArchive: Mock<(directory: string, archive: File) => Promise<string[]>>
}

let client: StoreCalls = freshClient()
let prompt: Mock<(request: PromptLike) => Promise<boolean>> = vi.fn()
let confirm: Mock<() => Promise<boolean>> = vi.fn()
let refusals: string[] = []
let notices: string[] = []
let navigations: string[] = []
let chosen: string | null = null
let tracked: Array<Promise<void>> = []
let refreshes = 0
let steps: string[] = []
let typed = TYPED

function freshClient(): StoreCalls {
  return {
    createDocument: vi.fn().mockResolvedValue(undefined),
    createFolder: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn().mockResolvedValue('journal/photo.png'),
    remove: vi.fn().mockResolvedValue(TRASH_ID),
    importArchive: vi.fn().mockResolvedValue(['journal/a.md', 'journal/b.md']),
  }
}

function bound({ selection = SELECTED, directory = FOLDER, confirmed = true, dismissed = false }: Bound = {}): void {
  prompt = vi.fn(async (request: PromptLike) => {
    if (dismissed) return await Promise.resolve(false)
    await request.submit(request.nameFor === undefined ? typed : request.nameFor(typed))

    return true
  })
  confirm = vi.fn().mockResolvedValue(confirmed)

  bindActions({
    root,
    navigate: (url: string) => {
      navigations.push(url)
    },
    client: cast<FilesClient>(client),
    dialogs: cast<Dialogs>({ prompt, confirm, choose: async () => await Promise.resolve(chosen) }),
    toast: cast<Toast>({
      show: (message: string) => {
        notices.push(message)
      },
      error: (message: string) => {
        refusals.push(message)
      },
    }),
    targetDirectory: () => directory,
    selectionPath: () => selection,
    refresh: async () => {
      await Promise.resolve()
      refreshes += 1
    },
    track: (work: Promise<void>) => {
      tracked.push(work)
    },
    reveal: () => {
      steps.push('revealed')
    },
    insertSelected: () => {
      steps.push('inserted')
    },
    openCreated: (entryPath: string) => {
      steps.push(`opened ${entryPath}`)
    },
    openSelected: () => {
      steps.push('opened the selection')
    },
  })
}

function press(selector: string): void {
  root.querySelector<HTMLElement>(selector)?.click()
}

function uploadInput(): HTMLInputElement {
  const element = root.querySelector<HTMLInputElement>('#upload-input')
  if (element === null) throw new Error('missing the upload input')

  return element
}

function sendFiles(files: readonly File[] | null): void {
  const input = uploadInput()
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input.dispatchEvent(new Event('change'))
}

async function settled(): Promise<void> {
  await Promise.all(tracked)
}

beforeEach(() => {
  document.body.innerHTML = renderPage()
  ;({ body: root } = document)
  client = freshClient()
  refusals = []
  notices = []
  navigations = []
  chosen = null
  tracked = []
  refreshes = 0
  steps = []
  typed = TYPED
})

describe('the buttons that only pass the gesture on', () => {
  it.each([
    ['reveal-document', 'revealed'],
    ['insert-entry', 'inserted'],
    ['open-selected', 'opened the selection'],
  ])('hands %s to whoever owns it', (part, expected) => {
    bound()
    updateInsertAvailability(root, SELECTED)
    given(() => {
      expect(root.querySelector<HTMLButtonElement>(`#${part}`)?.disabled).toBe(false)
    })

    press(`#${part}`)

    expect(steps).toStrictEqual([expected])
  })
})

describe('creating a document', () => {
  it('asks the reader what to call it', async () => {
    bound()

    press('#new-document')
    await settled()

    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('creates it inside the directory the selection points at', async () => {
    bound({ directory: FOLDER })

    press('#new-document')
    await settled()

    expect(client.createDocument).toHaveBeenCalledWith(`${FOLDER}/${TYPED}`)
  })

  it('redraws the browser, so the new entry appears', async () => {
    bound()

    press('#new-document')
    await settled()

    expect(refreshes).toBe(1)
  })

  it('opens what it made, so the reader lands in the thing they just created', async () => {
    bound()

    press('#new-document')
    await settled()

    expect(steps).toStrictEqual([`opened ${FOLDER}/${TYPED}`])
  })

  it('opens nothing when the dialog was dismissed, because nothing was made', async () => {
    bound({ dismissed: true })

    press('#new-document')
    await settled()

    expect(steps).toStrictEqual([])
  })
})

describe('creating a folder', () => {
  it('creates it where the selection points', async () => {
    bound()

    press('#new-folder')
    await settled()

    expect(client.createFolder).toHaveBeenCalledWith(`${FOLDER}/${TYPED}`)
  })

  it('creates it at the store root when nothing is selected', async () => {
    bound({ directory: STORE_ROOT })

    press('#new-folder')
    await settled()

    expect(client.createFolder).toHaveBeenCalledWith(TYPED)
  })
})

describe('a name the store will not take', () => {
  it('keeps the dialog open with the reason, rather than throwing what was typed away', async () => {
    bound()
    client.createDocument.mockRejectedValue(new FilesRequestError(409, 'Already exists', 'ALREADY_EXISTS'))
    let reported: string | null = 'not asked'
    bindActionsWith(
      vi.fn(async (request: PromptLike) => {
        reported = await request.submit(TYPED)

        return await Promise.resolve(false)
      }),
    )

    press('#new-document')
    await settled()

    expect(reported).toBe('Already exists')
  })

  it('reports a refusal the reader cannot fix by retyping', async () => {
    bound()
    client.createDocument.mockRejectedValue(new FilesRequestError(503, 'Busy, try again', 'BUSY'))

    press('#new-document')
    await settled()

    expect(refusals).toStrictEqual(['Busy, try again'])
  })
})

function bindActionsWith(prompting: Mock<(request: PromptLike) => Promise<boolean>>): void {
  document.body.innerHTML = renderPage()
  ;({ body: root } = document)
  bindActions({
    root,
    client: cast<FilesClient>(client),
    dialogs: cast<Dialogs>({ prompt: prompting, confirm: vi.fn().mockResolvedValue(true) }),
    navigate: (url: string) => {
      navigations.push(url)
    },
    toast: cast<Toast>({
      show: () => undefined,
      error: (message: string) => {
        refusals.push(message)
      },
    }),
    targetDirectory: () => FOLDER,
    selectionPath: () => SELECTED,
    refresh: async () => {
      await Promise.resolve()
    },
    track: (work: Promise<void>) => {
      tracked.push(work)
    },
    reveal: () => undefined,
    insertSelected: () => undefined,
    openCreated: () => undefined,
    openSelected: () => undefined,
  })
}

describe('deleting the selection', () => {
  it('asks before anything moves to the trash', async () => {
    bound()

    press('#delete-entry')
    await settled()

    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('moves the selection to the trash once that is confirmed', async () => {
    bound()

    press('#delete-entry')
    await settled()

    expect(client.remove).toHaveBeenCalledWith(SELECTED)
  })

  it('removes nothing when the reader changes their mind', async () => {
    bound({ confirmed: false })

    press('#delete-entry')
    await settled()

    expect(client.remove).not.toHaveBeenCalled()
  })

  it('says what to do when nothing is selected to delete', () => {
    bound({ selection: null })

    press('#delete-entry')

    expect(notices).toStrictEqual(['Select something to delete first'])
  })

  it('asks whoever is editing to settle before the entry goes', async () => {
    bound()
    let goneAlready = true
    onDeletionPending(root, () => {
      goneAlready = client.remove.mock.calls.length > 0

      return Promise.resolve()
    })

    press('#delete-entry')
    await settled()

    expect(goneAlready).toBe(false)
  })

  it('waits for that settling rather than racing it', async () => {
    bound()
    const saving = Promise.withResolvers<undefined>()
    let goneWhileSaving = true
    onDeletionPending(root, async () => {
      await saving.promise
      goneWhileSaving = client.remove.mock.calls.length > 0
    })

    press('#delete-entry')
    saving.resolve(undefined)
    await settled()
    given(() => {
      expect(client.remove).toHaveBeenCalledWith(SELECTED)
    })

    expect(goneWhileSaving).toBe(false)
  })

  it('announces the trash entry the delete created, so an open tab can follow it', async () => {
    bound()
    const heard: TrashedEntry[] = []
    onEntryTrashed(root, (trashed) => {
      heard.push(trashed)
    })

    press('#delete-entry')
    await settled()

    expect(heard).toStrictEqual([{ entryPath: SELECTED, trashId: TRASH_ID }])
  })

  it('announces nothing when the confirmation is declined', async () => {
    bound({ confirmed: false })
    const heard: TrashedEntry[] = []
    onEntryTrashed(root, (trashed) => {
      heard.push(trashed)
    })

    press('#delete-entry')
    await settled()

    expect(heard).toStrictEqual([])
  })
})

describe('uploading files', () => {
  function png(name: string): File {
    return new File([new Uint8Array([1])], name)
  }

  it('opens the picker when the toolbar button is pressed', () => {
    bound()
    const opened: string[] = []
    uploadInput().click = (): void => {
      opened.push('picker')
    }

    press('#upload-file')

    expect(opened).toStrictEqual(['picker'])
  })

  it('sends each chosen file to the directory the selection points at', async () => {
    bound()

    sendFiles([png('a.png'), png('b.png')])
    await settled()

    expect(client.upload.mock.calls.map(([directory, file]) => `${directory}/${file.name}`)).toStrictEqual([
      `${FOLDER}/a.png`,
      `${FOLDER}/b.png`,
    ])
  })

  it('reports one refused file without discarding the rest', async () => {
    bound()
    client.upload.mockImplementation(async (_directory: string, file: File) => {
      if (file.name === 'bad.png') throw new FilesRequestError(400, 'Content does not match', 'CONTENT_MISMATCH')

      return await Promise.resolve('ok')
    })

    sendFiles([png('bad.png'), png('good.png')])
    await settled()

    expect(refusals).toStrictEqual(['bad.png: Content does not match'])
  })

  it('uploads nothing when the picker was dismissed without choosing a file', async () => {
    bound()

    sendFiles([])
    await settled()

    expect(client.upload).not.toHaveBeenCalled()
  })

  it('uploads nothing when the picker offers no list of files at all', async () => {
    bound()

    sendFiles(null)
    await settled()

    expect(client.upload).not.toHaveBeenCalled()
  })

  it('clears the picker, so choosing the same file twice still uploads it', async () => {
    bound()
    const input = uploadInput()
    Object.defineProperty(input, 'value', { value: 'a.png', writable: true, configurable: true })
    given(() => {
      expect(input.value).toBe('a.png')
    })

    sendFiles([png('a.png')])
    await settled()

    expect(input.value).toBe('')
  })
})

describe('what the toolbar says about the selection', () => {
  function insertButton(): HTMLButtonElement {
    const element = root.querySelector<HTMLButtonElement>('#insert-entry')
    if (element === null) throw new Error('missing the insert button')

    return element
  }

  it('offers insert for something a document can link to', () => {
    updateInsertAvailability(root, SELECTED)

    expect(insertButton().disabled).toBe(false)
  })

  it('withholds insert when there is nothing to link to', () => {
    updateInsertAvailability(root, null)

    expect(insertButton().disabled).toBe(true)
  })

  it('leaves a page without the button alone rather than failing', () => {
    insertButton().remove()

    expect(() => {
      updateInsertAvailability(root, SELECTED)
    }).not.toThrow()
  })
})

describe('a failure that is not an Error at all', () => {
  it('is still reported, even though there is no message to pass on', async () => {
    bound()
    client.createDocument.mockRejectedValue('a bare string')

    press('#new-document')
    await settled()

    expect(refusals).toStrictEqual(['unknown error'])
  })
})

describe('the archive button', () => {
  function importInput(): HTMLInputElement {
    const element = root.querySelector<HTMLInputElement>('#import-input')
    if (element === null) throw new Error('missing the import input')

    return element
  }

  function sendArchive(files: readonly File[] | null): void {
    const input = importInput()
    Object.defineProperty(input, 'files', { value: files, configurable: true })
    input.dispatchEvent(new Event('change'))
  }

  it.each(['zip', 'tar.gz'] as const)('downloads the target folder as %s when that is chosen', async (format) => {
    chosen = format
    bound()

    press('#archive-actions')
    await settled()

    expect(navigations).toStrictEqual([archiveUrlFor(FOLDER, format)])
  })

  it('downloads the whole store when that is the target', async () => {
    chosen = 'zip'
    bound({ directory: STORE_ROOT })

    press('#archive-actions')
    await settled()

    expect(navigations).toStrictEqual([archiveUrlFor(STORE_ROOT, 'zip')])
  })

  it('downloads nothing when the dialog is dismissed', async () => {
    chosen = null
    bound()

    press('#archive-actions')
    await settled()

    expect(navigations).toStrictEqual([])
  })

  it('opens the file picker rather than downloading when an import is chosen', async () => {
    chosen = 'import'
    bound()
    const opened = vi.spyOn(importInput(), 'click')

    press('#archive-actions')
    await settled()

    expect({ opened: opened.mock.calls.length, navigations }).toStrictEqual({ opened: 1, navigations: [] })
  })

  it('imports the chosen archive into the target folder', async () => {
    bound()
    const archive = new File(['PK'], 'notes.zip')

    sendArchive([archive])
    await settled()

    expect(client.importArchive.mock.calls).toStrictEqual([[FOLDER, archive]])
  })

  it('reports what landed, so the reader knows the archive was taken whole', async () => {
    bound()

    sendArchive([new File(['PK'], 'notes.zip')])
    await settled()

    expect(notices).toStrictEqual(['Imported 2 from notes.zip'])
  })

  it('refreshes the tree, which is what makes the imported files visible', async () => {
    bound()

    sendArchive([new File(['PK'], 'notes.zip')])
    await settled()

    expect(refreshes).toBe(1)
  })

  it('names the entry that was refused, which is the only thing the reader can act on', async () => {
    bound()
    client.importArchive.mockRejectedValue(
      new FilesRequestError(400, 'Refused', 'INVALID_PATH', {
        paths: [],
        reasons: ['../evil.md is not a name the store accepts'],
      }),
    )

    sendArchive([new File(['PK'], 'notes.zip')])
    await settled()

    expect(refusals).toStrictEqual(['Refused: ../evil.md is not a name the store accepts'])
  })

  it('names the path that is already there when the archive would replace it', async () => {
    bound()
    client.importArchive.mockRejectedValue(
      new FilesRequestError(409, 'Already there', 'ALREADY_EXISTS', { paths: ['notes.md'], reasons: [] }),
    )

    sendArchive([new File(['PK'], 'notes.zip')])
    await settled()

    expect(refusals).toStrictEqual(['Already there: notes.md'])
  })

  it('reports a refusal that names no entry at all on its message alone', async () => {
    bound()
    client.importArchive.mockRejectedValue(new FilesRequestError(400, 'Not an archive', 'BAD_REQUEST'))

    sendArchive([new File(['PK'], 'notes.zip')])
    await settled()

    expect(refusals).toStrictEqual(['Not an archive'])
  })

  it('reports a failure that names nothing on its own message alone', async () => {
    bound()
    client.importArchive.mockRejectedValue(new Error('disk on fire'))

    sendArchive([new File(['PK'], 'notes.zip')])
    await settled()

    expect(refusals).toStrictEqual(['disk on fire'])
  })

  it('imports nothing when the picker is dismissed without a file', async () => {
    bound()

    sendArchive(null)
    await settled()

    expect(client.importArchive.mock.calls).toStrictEqual([])
  })

  it('leaves a page without the archive button alone rather than failing', () => {
    root.querySelector('#archive-actions')?.remove()

    expect(() => {
      bound()
    }).not.toThrow()
  })
})
