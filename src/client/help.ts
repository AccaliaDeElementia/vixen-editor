'use sanity'

interface Entry {
  does: string
  how: string
}

const SHORTCUTS: readonly Entry[] = [
  { does: 'Save the document', how: 'Ctrl/Cmd + S' },
  { does: 'Open the link the caret is in', how: 'Ctrl/Cmd + Enter' },
  { does: 'Dismiss a link tooltip', how: 'Escape' },
  { does: 'Move through the file browser', how: 'Arrow keys' },
  { does: 'Open the row the focus is on', how: 'Enter' },
  { does: 'Insert a link to the selected file', how: 'Ctrl/Cmd + I in the file browser' },
  { does: 'Resize the file browser', how: 'Arrow keys on the handle' },
]

const GESTURES: readonly Entry[] = [
  { does: 'Open a document', how: 'Double-click a row, or press Enter on it' },
  { does: 'Follow a link in the text', how: 'Ctrl/Cmd + click, or tap it and then tap Open' },
  { does: 'Insert a link to a file', how: 'Drag the row into the document, or select it and press Insert' },
  { does: 'Add an image or file', how: 'Drop it onto the document, or use Upload' },
  { does: 'See an image in place', how: 'Put it alone on its own line' },
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
