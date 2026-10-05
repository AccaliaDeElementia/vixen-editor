'use sanity'

import { classifyFile, DOCUMENT_EXTENSIONS, IMAGE_EXTENSIONS, type FileKind } from '../../shared/documents.ts'
import { basenameOf, directoryOf } from '../../shared/link-paths.ts'
import { EMPTY } from '../../shared/sequences.ts'
import { errorMessage } from '../error-message.ts'
import type { FilesClient } from '../files/files-client.ts'
import { restoreCandidatesFor, type RestoreCandidate } from '../files/restore-candidates.ts'
import { folderPathsIn, type TreeNode } from '../files/tree-model.ts'
import type { Toast } from '../toast.ts'

const CREATE_SELECTOR = '[data-part="missing-create"]'
const UPLOAD_SELECTOR = '[data-part="missing-upload"]'
const UPLOAD_INPUT_SELECTOR = '[data-part="missing-upload-input"]'
const RESTORE_SELECTOR = '[data-part="missing-restore"]'
const RESTORE_LIST_SELECTOR = '[data-part="missing-restore-list"]'

const ONLY_FILE = 0

const ACCEPTED: Readonly<Record<FileKind, readonly string[]>> = {
  document: DOCUMENT_EXTENSIONS,
  image: IMAGE_EXTENSIONS,
}

export interface MissingView {
  offer: (missingPath: string) => void
}

interface MissingViewOptions {
  host: ParentNode
  client: FilesClient
  toast: Toast
  reopen: () => void
}

interface Parts {
  create: HTMLButtonElement
  upload: HTMLButtonElement
  uploadInput: HTMLInputElement
  restore: HTMLElement
  restoreList: HTMLElement
}

function partsOf(root: ParentNode): Parts | null {
  const create = root.querySelector<HTMLButtonElement>(CREATE_SELECTOR)
  const upload = root.querySelector<HTMLButtonElement>(UPLOAD_SELECTOR)
  const uploadInput = root.querySelector<HTMLInputElement>(UPLOAD_INPUT_SELECTOR)
  const restore = root.querySelector<HTMLElement>(RESTORE_SELECTOR)
  const restoreList = root.querySelector<HTMLElement>(RESTORE_LIST_SELECTOR)

  if (create === null || upload === null || uploadInput === null) return null
  if (restore === null || restoreList === null) return null

  return { create, upload, uploadInput, restore, restoreList }
}

function livePathsIn(tree: readonly TreeNode[]): Set<string> {
  return new Set(folderPathsIn(tree))
}

function describeCandidate(candidate: RestoreCandidate): string {
  const when = new Date(candidate.deletedAt).toLocaleString()

  return candidate.whole ? `the whole folder ${candidate.originalPath}, deleted ${when}` : `deleted ${when}`
}

const INERT: MissingView = {
  offer: () => undefined,
}

export function createMissingView(options: MissingViewOptions): MissingView {
  const parts = partsOf(options.host)
  if (parts === null) return INERT

  const { create, upload, uploadInput, restore, restoreList } = parts
  let target = ''

  async function restoreEntry(candidate: RestoreCandidate): Promise<void> {
    try {
      await options.client.restore(candidate.id)
      options.reopen()
    } catch (error) {
      options.toast.error(`Restore failed: ${errorMessage(error)}`)
    }
  }

  function rowFor(candidate: RestoreCandidate): HTMLLIElement {
    const row = document.createElement('li')
    row.className = 'restore__entry'

    const what = document.createElement('span')
    what.className = 'restore__what'
    what.textContent = describeCandidate(candidate)
    row.append(what)

    if (candidate.blockedBy === null) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'view__action'
      button.textContent = 'Restore'
      button.addEventListener('click', () => {
        void restoreEntry(candidate)
      })
      row.append(button)
    } else {
      const blocked = document.createElement('span')
      blocked.className = 'restore__blocked'
      blocked.textContent = `${candidate.blockedBy} is back, so this cannot be restored`
      row.append(blocked)
    }

    return row
  }

  function listCandidates(candidates: readonly RestoreCandidate[]): void {
    restoreList.replaceChildren(...candidates.map(rowFor))
    restore.hidden = candidates.length === EMPTY
  }

  async function loadCandidates(missingPath: string): Promise<void> {
    const [trash, tree] = await Promise.all([options.client.trash(), options.client.tree()])

    listCandidates(restoreCandidatesFor(missingPath, trash, livePathsIn(tree)))
  }

  async function createHere(): Promise<void> {
    try {
      await options.client.createDocument(target)
      options.reopen()
    } catch (error) {
      options.toast.error(`Create failed: ${errorMessage(error)}`)
    }
  }

  async function uploadHere(file: File): Promise<void> {
    try {
      await options.client.upload(directoryOf(target), file, basenameOf(target))
      options.reopen()
    } catch (error) {
      options.toast.error(`Upload failed: ${errorMessage(error)}`)
    }
  }

  create.addEventListener('click', () => {
    void createHere()
  })
  upload.addEventListener('click', () => {
    uploadInput.click()
  })
  uploadInput.addEventListener('change', () => {
    const { [ONLY_FILE]: file } = [...(uploadInput.files ?? [])]
    uploadInput.value = ''
    if (file !== undefined) void uploadHere(file)
  })

  return {
    offer(missingPath: string): void {
      target = missingPath

      const kind = classifyFile(missingPath)
      create.hidden = kind !== 'document'
      uploadInput.accept = (kind === null ? [] : ACCEPTED[kind]).join(',')

      restore.hidden = true
      restoreList.replaceChildren()

      void loadCandidates(missingPath).catch((error: unknown) => {
        options.toast.error(`Could not read the trash: ${errorMessage(error)}`)
      })
    },
  }
}
