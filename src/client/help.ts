'use sanity'

interface Entry {
  does: string
  how: string
  keys?: readonly string[]
}

export const KEYS = {
  save: 'Mod-s',
  openLink: 'Mod-Enter',
  dismissTooltip: 'Escape',
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
}

const SHORTCUTS: readonly Entry[] = [
  { does: 'Save the document', how: 'Ctrl/Cmd + S', keys: [KEYS.save] },
  { does: 'Open the link the caret is in', how: 'Ctrl/Cmd + Enter', keys: [KEYS.openLink] },
  { does: 'Dismiss a link tooltip', how: 'Escape', keys: [KEYS.dismissTooltip] },
  {
    does: 'Move through the file browser',
    how: 'Arrow keys',
    keys: [KEYS.nextRow, KEYS.previousRow, KEYS.expandRow, KEYS.collapseRow],
  },
  { does: 'Open the row the focus is on', how: 'Enter', keys: [KEYS.openRow] },
  { does: 'Insert a link to the selected file', how: 'Ctrl/Cmd + I in the file browser', keys: [KEYS.insert] },
  { does: 'Show the document as highlighted source', how: 'Alt + Shift + P', keys: [KEYS.previewSource] },
  { does: 'Show the document rendered', how: 'Alt + P', keys: [KEYS.previewMarkup] },
  { does: 'Close the tab in front of you', how: 'Alt + W', keys: [KEYS.closeTab] },
  { does: 'Move to the next or previous tab', how: 'Alt + ] and Alt + [', keys: [KEYS.nextTab, KEYS.previousTab] },
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
    does: 'Resize the file browser, or the split between editors',
    how: 'Arrow keys on the handle',
    keys: [KEYS.narrower, KEYS.wider, KEYS.narrowest, KEYS.widest],
  },
]

const GESTURES: readonly Entry[] = [
  { does: 'Select a file or folder', how: 'Click a row, or move to it with the arrow keys' },
  { does: 'Open a document', how: 'Double-click a row, or press Enter on it' },
  { does: 'Follow a link in the text', how: 'Ctrl/Cmd + click, or tap it and then tap Open' },
  { does: 'Insert a link to a file', how: 'Drag the row into the document, or select it and press Insert' },
  { does: 'Move a file or folder', how: 'Drag the row onto a folder' },
  { does: 'Add an image or file', how: 'Drop it onto the document, or use Upload' },
  { does: 'See an image in place', how: 'Put it alone on its own line' },
  { does: 'Resize the file browser', how: 'Drag the divider, or focus it and use the arrow keys' },
]

const MARKDOWN: readonly Entry[] = [
  { does: 'Heading', how: '# Title, ## Section, ### Subsection' },
  { does: 'Emphasis', how: '*italic*, **bold**' },
  { does: 'Link', how: '[text](other.md)' },
  { does: 'Image', how: '![alt](picture.png)' },
  { does: 'List', how: '- item, or 1. item' },
  { does: 'Quote', how: '> quoted' },
  { does: 'Code', how: '`inline`, or a ``` fenced block' },
  { does: 'Callout', how: 'TODO:, FIXME: or NOTE: at the start of a note' },
]

interface Section {
  heading: string
  column: string
  entries: readonly Entry[]
}

export const HELP_SECTIONS: readonly Section[] = [
  { heading: 'Getting around', column: 'How', entries: GESTURES },
  { heading: 'Keyboard', column: 'Keys', entries: SHORTCUTS },
  { heading: 'Markdown', column: 'Looks like', entries: MARKDOWN },
]

function asTable({ heading, column, entries }: Section): string {
  const rows = entries.map((entry) => `| ${entry.does} | ${entry.how} |`).join('\n')

  return `## ${heading}\n\n| What | ${column} |\n| --- | --- |\n${rows}\n`
}

export function cheatsheet(): string {
  return HELP_SECTIONS.map(asTable).join('\n')
}
