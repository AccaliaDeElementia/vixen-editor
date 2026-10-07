'use sanity'

import { Prec, type EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'

import { docUrlFor } from '../doc-path.ts'
import { errorMessage } from '../error-message.ts'
import { isBlank } from '../../shared/content.ts'
import { KEYS } from '../help.ts'
import type { Dialogs } from '../files/dialogs.ts'
import type { FilesClient } from '../files/files-client.ts'
import type { StatusBar } from '../layout/status-bar.ts'
import type { Toast } from '../toast.ts'

import { createAutosave, type SaveState } from './autosave.ts'
import { recallCaret, rememberCaret } from './carets.ts'
import { isConflict, offerResolution } from './conflict.ts'
import { bindEntryDrops, bindFileDrops } from './drops.ts'
import { watchFreshness } from './freshness.ts'
import { createHolderControl, holderOf } from './holder.ts'
import { describeRefusal } from './leaving.ts'
import { bindLinkClicks } from './link-clicks.ts'
import { linkTargetAt } from './link-targets.ts'
import { createEditorState } from './markdown-setup.ts'
import { createMaterialised } from './materialised.ts'
import { createMergeControl } from './merging.ts'
import type { Session } from './session.ts'

const TOP_OF_DOCUMENT = 0

export type FocusListener = (wake: () => void, settled: () => Promise<void>) => () => void

interface DocumentTabOptions {
  mount: Element
  session: Session
  files: FilesClient
  dialogs: Dialogs
  toast: Toast
  statusBar: StatusBar
  documentId: () => string | null
  openUrl: (url: string) => void
  showingDocument: () => boolean
  announce: (text: string) => void
  onStored: () => void
  onEdited: (content: string) => void
  onReloaded: (content: string) => void
  onCaretMoved: (offset: number) => void
  listenForFocus?: FocusListener | undefined
}

export interface CarriedDocument {
  state: EditorState
  storedContent: string
}

export interface DocumentTab {
  view: EditorView
  recheck: () => Promise<void>
  caret: () => number
  saveState: () => SaveState
  flush: () => Promise<void>
  insertAt: (text: string, at: number | null) => void
  putCaretAt: (offset: number) => void
  open: (entryPath: string, content: string) => void
  adopt: (entryPath: string, carried: CarriedDocument) => void
  handOver: () => CarriedDocument
  load: (content: string) => void
  empty: () => void
  followMove: (to: string) => void
  rescue: () => void
  settleBeforeLeaving: () => Promise<boolean>
  teardownDocument: () => void
}

function caretIn(state: EditorState): number {
  return state.selection.main.head
}

export function startsALine(state: EditorState, position: number | null): boolean {
  return position === null || position === state.doc.lineAt(position).from
}

export function createDocumentTab(options: DocumentTabOptions): DocumentTab {
  const { session, files, dialogs, toast, statusBar, documentId, openUrl, announce } = options

  let caretPosition = TOP_OF_DOCUMENT
  let openedAt: string | null = null
  const materialised = createMaterialised()
  let lastRefusal: unknown = null

  const holder = createHolderControl()

  let merged = ''
  const merging = createMergeControl(() => {
    announce(`${merged} merged — every change resolved`)
  })

  async function writeDocument(content: string): Promise<void> {
    const target = documentId()
    if (target === null) return

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
    if (target === null) return false
    if (autosave.state() === 'clean') {
      announce(`No changes in ${target}`)
      return true
    }

    void autosave.flush().then(() => {
      if (autosave.state() === 'clean') announce(`Saved ${target}`)
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
            { key: KEYS.save, preventDefault: true, run: save },
            { key: KEYS.openLink, run: openLinkAtCaret },
          ]),
        ),
        EditorView.updateListener.of((update) => {
          caretPosition = caretIn(update.state)
          merging.endWhenResolved(update.view)
          options.onCaretMoved(caretPosition)
          if (!update.docChanged) return

          const content = update.state.doc.toString()
          options.onEdited(content)
          autosave.changed(content)
          statusBar.showWordCount(content)
        }),
      ],
    })
  }

  const view = new EditorView({ parent: options.mount, state: stateFor('', TOP_OF_DOCUMENT) })

  const dropPosition = (event: DragEvent): number | null => view.posAtCoords({ x: event.clientX, y: event.clientY })

  const insertAt = (text: string, at: number | null): void => {
    const from = at ?? view.state.selection.main.head
    view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + text.length } })
    view.focus()
  }

  const putCaretAt = (offset: number): void => {
    const at = Math.min(offset, view.state.doc.length)
    view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at) })
    view.focus()
  }

  bindEntryDrops(view.contentDOM, dropPosition, { holder: documentId, insert: insertAt })

  bindFileDrops(view.contentDOM, dropPosition, (position) => startsALine(view.state, position), {
    holder: documentId,
    client: files,
    dialogs,
    toast,
    insert: insertAt,
    announce: options.onStored,
  })

  bindLinkClicks(view.contentDOM, {
    holder: () => holderOf(view.state),
    open: (entryPath) => {
      openUrl(docUrlFor(entryPath))
    },
  })

  function empty(): void {
    view.setState(stateFor('', TOP_OF_DOCUMENT))
    autosave.reset('')
    statusBar.showWordCount('')
  }

  function load(content: string): void {
    const caret = Math.min(caretPosition, content.length)
    view.setState(stateFor(content, caret))
    autosave.reset(content)
    statusBar.showWordCount(content)
    options.onReloaded(content)
  }

  function open(entryPath: string, content: string): void {
    if (openedAt !== null) materialised.remember(openedAt, view.state)
    openedAt = entryPath

    const loaded = materialised.recall(entryPath, content)
    const caret = loaded === null ? recallCaret(entryPath, content.length) : caretIn(loaded)

    caretPosition = caret
    view.setState(loaded ?? stateFor(content, caret))
    holder.follow(view, entryPath)
    autosave.reset(content)
    statusBar.showWordCount(content)
    view.dispatch({ effects: EditorView.scrollIntoView(caret) })
  }

  function adopt(entryPath: string, carried: CarriedDocument): void {
    const text = carried.state.doc.toString()
    openedAt = entryPath
    caretPosition = caretIn(carried.state)
    view.setState(carried.state)
    holder.follow(view, entryPath)
    autosave.reset(carried.storedContent)
    autosave.changed(text)
    statusBar.showWordCount(text)
  }

  function handOver(): CarriedDocument {
    const carried = { state: view.state, storedContent: autosave.lastSaved() }
    openedAt = null
    empty()

    return carried
  }

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

  async function resolveConflict(target: string, theirs: string): Promise<void> {
    const resolved = await offerResolution(
      {
        dialogs,
        files,
        announce,
        takeTheirs: load,
        keepMine: async () => {
          await autosave.flush()
        },
        merge: (onDisk: string) => {
          merged = target
          merging.begin(view, onDisk)
          announce(`Merging ${target} — accept or reject each change, then it saves as usual`)
        },
      },
      { target, theirs, mine: view.state.doc.toString() },
    )
    if (!resolved) toast.error(`${target} changed on disk — your unsaved changes can no longer be saved as they are`)
  }

  async function checkFreshness(): Promise<void> {
    if (!options.showingDocument() || autosave.state() === 'saving') return

    const target = documentId()
    if (target === null) return

    const loaded = await session.reread(target).catch(() => null)
    if (loaded === null || target !== documentId()) return

    const { content } = loaded
    if (autosave.state() !== 'clean') {
      await resolveConflict(target, content)

      return
    }

    load(content)
    announce(`${target} changed on disk — reloaded`)
  }

  const { unwatchFreshness, recheck } = watchFreshness({
    check: checkFreshness,
    listen: options.listenForFocus,
  })

  return {
    view,
    recheck,
    caret: () => caretPosition,
    saveState: autosave.state,
    flush: autosave.flush,
    insertAt,
    putCaretAt,
    open,
    adopt,
    handOver,
    load,
    empty,
    followMove: (to: string) => {
      holder.follow(view, to)
    },
    rescue: () => {
      const target = documentId()
      const content = view.state.doc.toString()
      if (target !== null && !isBlank(content)) session.saveOnUnload(target, content)
    },
    settleBeforeLeaving,
    teardownDocument: () => {
      autosave.stop()
      unwatchFreshness()
      view.destroy()
    },
  }
}
