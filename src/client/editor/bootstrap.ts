'use sanity'

import { Prec, type EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'

import { displayPathFromPath, docUrlFor, documentIdFromPath, namesFolderIndex, pathAfterMove } from '../doc-path.ts'
import { classifyFile } from '../../shared/documents.ts'
import { onDocumentMoved } from '../document-moved.ts'
import { interceptNavigation, openDocumentIn, type Navigator } from '../navigation.ts'
import { errorMessage } from '../error-message.ts'

import { isBlank } from '../../shared/content.ts'
import { directoryOf } from '../../shared/link-paths.ts'
import { EMPTY } from '../../shared/sequences.ts'
import { STORE_ROOT } from '../../shared/store-path.ts'
import { cheatsheet } from '../help.ts'

import { createAutosave } from './autosave.ts'
import { caretsFollowMove, recallCaret, rememberCaret } from './carets.ts'
import { createDocumentClient } from './document-client.ts'
import { createEditorState } from './markdown-setup.ts'
import { trashEntryIdFromPath } from '../../shared/page-urls.ts'
import { createToast } from '../layout/toast.ts'
import { createFilesClient, type FilesClient } from '../files/files-client.ts'
import { createDeletedView } from '../layout/deleted-view.ts'
import { createImageView } from '../layout/image-view.ts'
import { createMissingView } from '../layout/missing-view.ts'
import { createStatusBar } from '../layout/status-bar.ts'
import { createWorkspace } from '../layout/workspace.ts'

import { createSession, type LoadedDocument, type Session } from './session.ts'
import { guardUnload } from './unload.ts'
import { describeRefusal } from './leaving.ts'
import { watchFreshness } from './freshness.ts'
import { isConflict, offerResolution } from './conflict.ts'
import { createMergeControl } from './merging.ts'
import { createHolderControl, holderOf } from './holder.ts'
import { linkTargetAt } from './link-targets.ts'
import { bindLinkClicks } from './link-clicks.ts'
import { bindEntryDrops, bindFileDrops, linkTo } from './drops.ts'
import { onInsertRequested } from '../insert-entry.ts'
import { createDialogs, type Dialogs } from '../files/dialogs.ts'

const MOUNT_SELECTOR = '#editor'
const SAVE_KEY = 'Mod-s'
const OPEN_LINK_KEY = 'Mod-Enter'
const UNREACHABLE_REASON_SELECTOR = '#unreachable-reason'
const TOP_OF_DOCUMENT = 0

interface BootstrapOptions {
  root?: ParentNode
  pathname?: string
  session?: Session
  navigate?: (url: string) => void
  listenForUnload?: (handler: (event: BeforeUnloadEvent) => void) => void
  files?: FilesClient
  reopen?: () => void
  openUrl?: (url: string) => void
  navigation?: Navigation
  dialogs?: Dialogs
  freshnessMs?: number
  listenForFocus?: (wake: () => void) => () => void
}

type LoadOutcome = { reached: true; document: LoadedDocument } | { reached: false; error: unknown }

async function loadOrReport(session: Session, id: string): Promise<LoadOutcome> {
  try {
    return { reached: true, document: await session.load(id) }
  } catch (error) {
    return { reached: false, error }
  }
}

function reportUnreachable(root: ParentNode, at: string, error: unknown): string {
  const subject = at === '' ? 'The store' : at
  const reason = `${subject} could not be loaded: ${errorMessage(error)}`
  const element = root.querySelector(UNREACHABLE_REASON_SELECTOR)

  if (element !== null) element.textContent = reason

  return reason
}

function startsALine(state: EditorState, position: number | null): boolean {
  return position === null || position === state.doc.lineAt(position).from
}

function caretIn(state: EditorState): number {
  return state.selection.main.head
}

function replaceAddress(url: string): void {
  window.history.replaceState(null, '', url)
}

function reloadPage(): void {
  window.location.reload()
}

function openPage(url: string): void {
  window.location.assign(url)
}

interface Wiring {
  root: ParentNode
  pathname: string
  session: Session
  navigate: (url: string) => void
  files: FilesClient
  reopen: () => void
  openUrl: (url: string) => void
}

function wiringFor(options: BootstrapOptions): Wiring {
  return {
    root: options.root ?? document,
    pathname: options.pathname ?? window.location.pathname,
    session: options.session ?? createSession(createDocumentClient()),
    navigate: options.navigate ?? replaceAddress,
    files: options.files ?? createFilesClient(),
    reopen: options.reopen ?? reloadPage,
    openUrl: options.openUrl ?? openPage,
  }
}

const BACK_SELECTOR = '#nav-back'
const FORWARD_SELECTOR = '#nav-forward'

function setEnabled(root: ParentNode, selector: string, enabled: boolean): void {
  const button = root.querySelector<HTMLButtonElement>(selector)
  if (button === null) return

  button.disabled = !enabled
  button.setAttribute('aria-disabled', String(!enabled))
}

function refreshHistoryButtons(root: ParentNode, navigator: Navigator): void {
  setEnabled(root, BACK_SELECTOR, navigator.canGoBack())
  setEnabled(root, FORWARD_SELECTOR, navigator.canGoForward())
}

function bindHistoryButtons(root: ParentNode, navigator: Navigator): void {
  root.querySelector(BACK_SELECTOR)?.addEventListener('click', () => {
    navigator.back()
  })
  root.querySelector(FORWARD_SELECTOR)?.addEventListener('click', () => {
    navigator.forward()
  })
}

class MissingMountError extends Error {
  override readonly name = 'MissingMountError'

  constructor(selector: string) {
    super(`Missing editor mount point: ${selector}`)
  }
}

async function bootstrap(options: BootstrapOptions = {}): Promise<EditorView> {
  const { root, pathname, session, navigate, files, reopen, openUrl } = wiringFor(options)
  const openDocument = openDocumentIn(root, pathname)

  const toast = createToast(root)
  const setStatus = (text: string): void => {
    toast.show(text)
  }

  const mount = root.querySelector(MOUNT_SELECTOR)
  if (mount === null) {
    setStatus(`Failed to start: ${new MissingMountError(MOUNT_SELECTOR).message}`)
    throw new MissingMountError(MOUNT_SELECTOR)
  }

  const documentId = (): string => openDocument.path()
  const statusBar = createStatusBar(root)
  const workspace = createWorkspace(root, {
    focusDocument: () => {
      view.focus()
    },
  })

  let caretPosition = TOP_OF_DOCUMENT
  let lastRefusal: unknown = null

  const holder = createHolderControl()

  const merging = createMergeControl(() => {
    setStatus(`${documentId()} merged — every change resolved`)
  })

  async function writeDocument(content: string): Promise<void> {
    const target = documentId()
    try {
      await session.save(target, content)
      lastRefusal = null
      rememberCaret(target, caretPosition)
    } catch (error) {
      lastRefusal = error
      toast.error(`Save failed: ${errorMessage(error)}`)
      throw error
    }
  }

  const autosave = createAutosave({
    save: writeDocument,
    report: (state) => {
      statusBar.showSaveState(state, autosave.dueAt())
      if (state === 'failed' && isConflict(lastRefusal)) void checkFreshness()
    },
  })

  const openLinkAtCaret = (editor: EditorView): boolean => {
    const found = linkTargetAt(editor.state, caretIn(editor.state))
    if (found === null) return false

    openUrl(docUrlFor(found.target))

    return true
  }

  const save = (): boolean => {
    const target = documentId()
    if (autosave.state() === 'clean') {
      setStatus(`No changes in ${target}`)
      return true
    }

    void autosave.flush().then(() => {
      if (autosave.state() === 'clean') setStatus(`Saved ${target}`)
    })

    return true
  }

  function stateFor(doc: string, caret: number): EditorState {
    return createEditorState({
      doc,
      selection: { anchor: caret },
      extensions: [
        basicSetup,
        holder.unset,
        merging.inactive,
        EditorView.lineWrapping,
        Prec.high(
          keymap.of([
            { key: SAVE_KEY, preventDefault: true, run: save },
            { key: OPEN_LINK_KEY, run: openLinkAtCaret },
          ]),
        ),
        EditorView.updateListener.of((update) => {
          caretPosition = caretIn(update.state)
          merging.endWhenResolved(update.view)
          if (!update.docChanged) return

          const content = update.state.doc.toString()
          autosave.changed(content)
          statusBar.showWordCount(content)
        }),
      ],
    })
  }

  const view = new EditorView({ parent: mount, state: stateFor('', TOP_OF_DOCUMENT) })

  const dialogs = options.dialogs ?? createDialogs(root)

  const dropPosition = (event: DragEvent): number | null => view.posAtCoords({ x: event.clientX, y: event.clientY })

  const insertAt = (text: string, at: number | null): void => {
    const from = at ?? view.state.selection.main.head
    view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + text.length } })
    view.focus()
  }

  bindEntryDrops(view.contentDOM, dropPosition, { holder: documentId, insert: insertAt })

  bindFileDrops(view.contentDOM, dropPosition, (position) => startsALine(view.state, position), {
    holder: documentId,
    client: files,
    dialogs,
    toast,
    insert: insertAt,
  })

  bindLinkClicks(view.contentDOM, {
    holder: () => holderOf(view.state),
    open: (entryPath) => {
      openUrl(docUrlFor(entryPath))
    },
  })

  const deletedView = createDeletedView({
    root,
    client: files,
    toast,
    openUrl,
    reveal: (at) => {
      workspace.show('deleted', at)
    },
  })

  const missingView = createMissingView({ root, client: files, toast, reopen })

  function emptyTheBuffer(): void {
    view.setState(stateFor('', TOP_OF_DOCUMENT))
    autosave.reset('')
    statusBar.showWordCount('')
  }

  function showMissing(entryPath: string, shown: string): void {
    emptyTheBuffer()
    workspace.show('missing', shown)
    missingView.offer(entryPath)
    setStatus(`${shown} is not in the store`)
  }

  const imageView = createImageView({
    root,
    reveal: (at) => {
      workspace.show('image', at)
    },
    onBroken: (entryPath) => {
      showMissing(entryPath, entryPath)
    },
  })

  async function withCheatsheetIfNew(template: string, entryPath: string): Promise<string> {
    if (directoryOf(entryPath) !== STORE_ROOT) return template

    const tree = await files.tree().catch(() => null)
    if (tree === null || tree.length > EMPTY) return template

    return `${template}\n${cheatsheet()}`
  }

  async function showDocument(entryPath: string, shown: string, isFolderIndex: boolean): Promise<void> {
    const outcome = await loadOrReport(session, entryPath)
    if (!outcome.reached) {
      emptyTheBuffer()
      workspace.show('unreachable', shown)
      setStatus(reportUnreachable(root, shown, outcome.error))

      return
    }

    const { document: loaded } = outcome
    const { content: template, stored } = loaded
    if (!stored && !isFolderIndex) {
      showMissing(entryPath, shown)

      return
    }

    const initial = stored ? template : await withCheatsheetIfNew(template, entryPath)

    const caret = recallCaret(entryPath, initial.length)
    caretPosition = caret
    view.setState(stateFor(initial, caret))
    holder.follow(view, entryPath)
    autosave.reset(initial)
    statusBar.showWordCount(initial)
    view.dispatch({ effects: EditorView.scrollIntoView(caret) })
    workspace.show('document', shown)
    setStatus(`Editing ${entryPath} — press Ctrl/Cmd+S to save`)
  }

  async function openPath(target: string): Promise<void> {
    const shown = displayPathFromPath(target)
    workspace.show('pending', shown)
    statusBar.showPath(shown)

    const trashEntryId = trashEntryIdFromPath(target)
    if (trashEntryId !== null) {
      emptyTheBuffer()
      deletedView.offer(trashEntryId)
      setStatus('This entry is in the trash')

      return
    }

    openDocument.commit(documentIdFromPath(target))
    if (classifyFile(documentId()) === 'image') {
      emptyTheBuffer()
      imageView.offer(documentId())
      setStatus(`Viewing ${documentId()}`)

      return
    }

    await showDocument(documentId(), shown, namesFolderIndex(target))
  }

  onDocumentMoved(root, ({ from, to, rewritten }) => {
    caretsFollowMove({ from, to })
    const moved = pathAfterMove({ from, to }, documentId())

    if (moved !== documentId()) {
      session.rename(documentId(), moved)
      openDocument.commit(moved)
      holder.follow(view, moved)
      navigate(docUrlFor(moved))
      statusBar.showPath(moved)
      setStatus(`Now editing ${moved}`)
    }

    if (rewritten.includes(documentId())) {
      toast.error(`${documentId()} changed on disk — reload to see the repaired links`)
    }
  })

  onInsertRequested(root, (entryPath) => {
    if (workspace.showing() !== 'document') {
      toast.error(`Open a document before inserting ${entryPath}`)

      return
    }

    insertAt(linkTo(entryPath, documentId()), caretPosition)
    setStatus(`Inserted a link to ${entryPath}`)
  })

  guardUnload({
    unsaved: () => autosave.state() !== 'clean',
    rescue: () => {
      const content = view.state.doc.toString()
      if (!isBlank(content)) session.saveOnUnload(documentId(), content)
    },
    listen: options.listenForUnload,
  })

  async function settleBeforeLeaving(): Promise<boolean> {
    await autosave.flush()

    const refusal = describeRefusal(autosave.state(), lastRefusal)
    if (refusal === null) return true

    const leaveAnyway = await dialogs.confirm({
      title: `${documentId()} could not be saved`,
      message: `${refusal} Leaving now discards the changes you made.`,
      confirmLabel: 'Discard and leave',
    })
    if (leaveAnyway) autosave.reset(view.state.doc.toString())

    return leaveAnyway
  }

  function loadIntoBuffer(content: string): void {
    const caret = Math.min(caretPosition, content.length)
    view.setState(stateFor(content, caret))
    autosave.reset(content)
    statusBar.showWordCount(content)
  }

  async function resolveConflict(target: string, theirs: string): Promise<void> {
    const resolved = await offerResolution(
      {
        dialogs,
        files,
        announce: setStatus,
        takeTheirs: loadIntoBuffer,
        keepMine: async () => {
          await autosave.flush()
        },
        merge: (onDisk: string) => {
          merging.begin(view, onDisk)
          setStatus(`Merging ${target} — accept or reject each change, then it saves as usual`)
        },
      },
      { target, theirs, mine: view.state.doc.toString() },
    )
    if (!resolved) toast.error(`${target} changed on disk — your unsaved changes can no longer be saved as they are`)
  }

  async function checkFreshness(): Promise<void> {
    if (workspace.showing() !== 'document' || autosave.state() === 'saving') return

    const target = documentId()
    const loaded = await session.reread(target).catch(() => null)
    if (loaded === null || target !== documentId()) return

    const { content } = loaded
    if (autosave.state() !== 'clean') {
      await resolveConflict(target, content)

      return
    }

    loadIntoBuffer(content)
    setStatus(`${target} changed on disk — reloaded`)
  }

  watchFreshness({ check: checkFreshness, intervalMs: options.freshnessMs, listen: options.listenForFocus })

  const navigator = interceptNavigation({
    navigation: options.navigation ?? globalThis.navigation,
    open: openPath,
    mayLeave: () => autosave.state() === 'clean',
    settle: settleBeforeLeaving,
    onSettled: () => {
      refreshHistoryButtons(root, navigator)
    },
  })
  bindHistoryButtons(root, navigator)

  await openPath(pathname)
  refreshHistoryButtons(root, navigator)

  return view
}

export async function bootstrapOrReport(options: BootstrapOptions = {}): Promise<EditorView | null> {
  return await bootstrap(options).catch((error: unknown) => {
    createToast(options.root ?? document).show(`Failed to start: ${errorMessage(error)}`)
    return null
  })
}

export const TestOnly = { MissingMountError, bootstrap, openPage, reloadPage, startsALine }
