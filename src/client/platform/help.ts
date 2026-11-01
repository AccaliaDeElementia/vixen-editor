'use sanity'

import { nameOfChords, neutralNameOf, type Chord, type KeyPlatform } from './key-spelling.ts'

interface Described {
  does: string
  how: string
  keys?: readonly string[]
}

interface Chorded {
  does: string
  chords: readonly Chord[]
  part?: string
}

type Entry = Described | Chorded

export const KEYS = {
  save: 'Mod-s',
  print: 'Mod-p',
  undo: 'Mod-z',
  redo: 'Mod-y',
  redoOnMac: 'Mod-Shift-z',
  redoOnLinux: 'Ctrl-Shift-z',
  find: 'Mod-f',
  findNext: 'Mod-g',
  openLink: 'Mod-Enter',
  bold: 'Mod-b',
  italic: 'Mod-i',
  code: 'Mod-e',
  link: 'Mod-k',
  dismissTooltip: 'Escape',
  foldSection: 'Ctrl-Shift-[',
  foldSectionOnMac: 'Cmd-Alt-[',
  unfoldSection: 'Ctrl-Shift-]',
  unfoldSectionOnMac: 'Cmd-Alt-]',
  indent: 'Mod-]',
  outdent: 'Mod-[',
  moveLineUp: 'Alt-ArrowUp',
  moveLineDown: 'Alt-ArrowDown',
  copyLineUp: 'Shift-Alt-ArrowUp',
  copyLineDown: 'Shift-Alt-ArrowDown',
  deleteLine: 'Shift-Mod-k',
  selectNextCopy: 'Mod-d',
  caretAbove: 'Mod-Alt-ArrowUp',
  caretBelow: 'Mod-Alt-ArrowDown',
  nextRow: 'ArrowDown',
  previousRow: 'ArrowUp',
  expandRow: 'ArrowRight',
  collapseRow: 'ArrowLeft',
  openRow: 'Enter',
  tickRow: ' ',
  rowAction: 'ArrowRight',
  leaveRowAction: 'ArrowLeft',
  insert: 'i',
  previewSource: 'P',
  previewMarkup: 'p',
  closeTab: 'w',
  nextTab: ']',
  previousTab: '[',
  moveTabLater: '}',
  moveTabEarlier: '{',
  firstTab: '1',
  ninthTab: '9',
  paneRight: 'ArrowRight',
  paneLeft: 'ArrowLeft',
  paneDown: 'ArrowDown',
  paneUp: 'ArrowUp',
  narrower: 'ArrowLeft',
  wider: 'ArrowRight',
  narrowest: 'Home',
  widest: 'End',
  nextControl: 'ArrowRight',
  previousControl: 'ArrowLeft',
  firstControl: 'Home',
  lastControl: 'End',
}

const SHORTCUTS: readonly Entry[] = [
  { does: 'Save the document', chords: [{ key: KEYS.save }] },
  { does: 'Print the document', how: 'Ctrl/Cmd + P', keys: [KEYS.print] },
  { does: 'Undo', chords: [{ key: KEYS.undo }], part: 'edit-undo' },
  {
    does: 'Redo what you undid',
    chords: [{ key: KEYS.redo, mac: KEYS.redoOnMac }, { linux: KEYS.redoOnLinux }],
    part: 'edit-redo',
  },
  { does: 'Find and replace inside the document', chords: [{ key: KEYS.find }], part: 'edit-find' },
  { does: 'Go to the next thing Find matched', chords: [{ key: KEYS.findNext }] },
  { does: 'Open the link the caret is in', chords: [{ key: KEYS.openLink }] },
  { does: 'Dismiss a link tooltip', chords: [{ key: KEYS.dismissTooltip }] },
  { does: 'Put bold around the selection', chords: [{ key: KEYS.bold }], part: 'format-bold' },
  { does: 'Put italics around the selection', chords: [{ key: KEYS.italic }], part: 'format-italic' },
  { does: 'Put code marks around the selection', chords: [{ key: KEYS.code }], part: 'format-code' },
  { does: 'Make the selection a link', chords: [{ key: KEYS.link }], part: 'format-link' },
  {
    does: 'Fold the section under a heading',
    chords: [{ key: KEYS.foldSection, mac: KEYS.foldSectionOnMac }],
  },
  {
    does: 'Unfold that section again',
    chords: [{ key: KEYS.unfoldSection, mac: KEYS.unfoldSectionOnMac }],
  },
  { does: 'Indent a list item, or take it back out', chords: [{ key: KEYS.indent }, { key: KEYS.outdent }] },
  { does: 'Move the line up or down', chords: [{ key: KEYS.moveLineUp }, { key: KEYS.moveLineDown }] },
  { does: 'Copy the line up or down', chords: [{ key: KEYS.copyLineUp }, { key: KEYS.copyLineDown }] },
  { does: 'Delete the whole line', chords: [{ key: KEYS.deleteLine }] },
  { does: 'Select the next copy of what is selected', chords: [{ key: KEYS.selectNextCopy }] },
  { does: 'Put another caret above or below', chords: [{ key: KEYS.caretAbove }, { key: KEYS.caretBelow }] },
  {
    does: 'Move through the file browser',
    how: 'Arrow keys',
    keys: [KEYS.nextRow, KEYS.previousRow, KEYS.expandRow, KEYS.collapseRow],
  },
  { does: 'Open the row the focus is on', how: 'Enter', keys: [KEYS.openRow] },
  { does: 'Insert a link to the selected file', how: 'Ctrl/Cmd + I in the file browser', keys: [KEYS.insert] },
  { does: 'Show the HTML the preview renders', how: 'Alt + Shift + P', keys: [KEYS.previewSource] },
  { does: 'Show the document rendered', how: 'Alt + P', keys: [KEYS.previewMarkup] },
  { does: 'Close the tab in front of you', how: 'Alt + W', keys: [KEYS.closeTab] },
  {
    does: 'Move to the next or previous tab',
    how: 'Alt + ] and Alt + [',
    keys: [KEYS.nextTab, KEYS.previousTab],
  },
  {
    does: 'Move a tab along its strip',
    how: 'Alt + Shift + ] and Alt + Shift + [',
    keys: [KEYS.moveTabLater, KEYS.moveTabEarlier],
  },
  { does: 'Jump to one of the first nine tabs', how: 'Alt + 1 to Alt + 9', keys: [KEYS.firstTab, KEYS.ninthTab] },
  {
    does: 'Move to the other editor pane, summoning it if it is not there',
    how: 'Ctrl + Alt + an arrow key',
    keys: [KEYS.paneLeft, KEYS.paneRight, KEYS.paneUp, KEYS.paneDown],
  },
  {
    does: 'Carry the tab in front to the other pane',
    how: 'Ctrl + Alt + Shift + an arrow key',
    keys: [KEYS.paneLeft, KEYS.paneRight, KEYS.paneUp, KEYS.paneDown],
  },
  {
    does: 'Choose what comes back from the trash',
    how: 'Space on a row, and the right arrow to put one back elsewhere',
    keys: [KEYS.tickRow, KEYS.rowAction, KEYS.leaveRowAction],
  },
  {
    does: 'Move along a toolbar — the file actions, the editing bar, or the tabs',
    how: 'Arrow keys, Home and End',
    keys: [KEYS.previousControl, KEYS.nextControl, KEYS.firstControl, KEYS.lastControl],
  },
  {
    does: 'Resize the file browser, or the split between editors',
    how: 'Arrow keys on the handle',
    keys: [KEYS.narrower, KEYS.wider, KEYS.narrowest, KEYS.widest],
  },
]

const GESTURES: readonly Entry[] = [
  { does: 'Select a file or folder', how: 'Click a row, or move to it with the arrow keys' },
  { does: 'Open a document', how: 'Double-click a row, or press Enter on it' },
  { does: 'Open a document in the other pane', how: 'Ctrl/Cmd + click a row' },
  {
    does: 'Keep a tab you are only looking at',
    how: 'Double-click the tab — an italic one closes when you open something else',
  },
  { does: 'Follow a link in the text', how: 'Ctrl/Cmd + click, or tap it and then tap Open' },
  { does: 'Insert a link to a file', how: 'Drag the row into the document, or select it and press Insert' },
  { does: 'Move a file or folder', how: 'Drag the row onto a folder' },
  { does: 'Add an image or file', how: 'Drop it onto the document, or use Upload' },
  { does: 'See an image in place', how: 'Put it alone on its own line' },
  { does: 'Save a copy of the document as HTML', how: 'The download button at the end of the editing bar' },
  { does: 'Resize the file browser', how: 'Drag the divider, or focus it and use the arrow keys' },
]

interface Section {
  heading: string
  column: string
  entries: readonly Entry[]
}

interface HelpSection {
  heading: string
  column: string
  entries: readonly Described[]
}

const SECTIONS: readonly Section[] = [
  { heading: 'Getting around', column: 'How', entries: GESTURES },
  { heading: 'Keyboard', column: 'Keys', entries: SHORTCUTS },
]

interface ControlChords {
  part: string
  chords: readonly Chord[]
}

export function chordsForControls(): readonly ControlChords[] {
  return SHORTCUTS.flatMap((entry) =>
    'chords' in entry && entry.part !== undefined ? [{ part: entry.part, chords: entry.chords }] : [],
  )
}

function describedFor(entry: Entry, platform: KeyPlatform): Described {
  return 'chords' in entry ? { does: entry.does, how: nameOfChords(entry.chords, platform) } : entry
}

function describedForAnyone(entry: Entry): Described {
  return 'chords' in entry ? { does: entry.does, how: neutralNameOf(entry.chords) } : entry
}

function readBy(describe: (entry: Entry) => Described): readonly HelpSection[] {
  return SECTIONS.map(({ heading, column, entries }) => ({ heading, column, entries: entries.map(describe) }))
}

export function helpSections(platform: KeyPlatform): readonly HelpSection[] {
  return readBy((entry) => describedFor(entry, platform))
}

function asTable({ heading, column, entries }: HelpSection): string {
  const rows = entries.map((entry) => `| ${entry.does} | ${entry.how} |`).join('\n')

  return `## ${heading}\n\n| What | ${column} |\n| --- | --- |\n${rows}\n`
}

function paragraph(...sentences: readonly string[]): string {
  return sentences.join(' ')
}

const PREAMBLE = [
  paragraph(
    'Your documents live in the file browser on the left.',
    'Opening one gives it a tab; a tab in italics is one you are only looking at,',
    'and opening something else takes its place.',
  ),
  '',
  paragraph(
    'The workspace can be split in two, side by side or one above the other,',
    'so two documents are open at once.',
    'A preview opens in the pane its document is not in, and follows the caret as you type.',
  ),
  '',
].join('\n')

export function cheatsheet(): string {
  return [PREAMBLE, ...sectionsForAnyone().map(asTable)].join('\n')
}

function sectionsForAnyone(): readonly HelpSection[] {
  return readBy(describedForAnyone)
}

export const TestOnly = { SECTIONS, sectionsForAnyone }
