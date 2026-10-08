'use sanity'

import { parser } from '@lezer/markdown'
import type { SyntaxNode } from '@lezer/common'

import { VIXEN_MARKDOWN_EXTENSIONS } from '../shared/markdown-tree.ts'
import { decodeDestination } from '../shared/link-syntax.ts'
import { highlightCode, resolveLanguage } from './highlight-code.ts'
import { sanitiseHtml, type SanitiseHtml } from './sanitise-html.ts'
import { closesATag, holdsNothing, openedBy } from './inline-html.ts'
import { decodeEntity } from './html-entities.ts'
import { safeDestination } from './safe-destination.ts'

const markdownParser = parser.configure(VIXEN_MARKDOWN_EXTENSIONS)

const PAST_MARKER = 1
const HTML_INFO = 'html'
const LABEL_CLOSES = ']'
const RAW_HTML_CLASS = 'markup__html'
const INLINE_TAG = 'HTMLTag'

const HEADINGS: ReadonlyMap<string, string> = new Map([
  ['ATXHeading1', 'h1'],
  ['ATXHeading2', 'h2'],
  ['ATXHeading3', 'h3'],
  ['ATXHeading4', 'h4'],
  ['ATXHeading5', 'h5'],
  ['ATXHeading6', 'h6'],
  ['SetextHeading1', 'h1'],
  ['SetextHeading2', 'h2'],
])

const SIMPLE_ELEMENTS: ReadonlyMap<string, string> = new Map([
  ['Paragraph', 'p'],
  ['Blockquote', 'blockquote'],
  ['BulletList', 'ul'],
  ['OrderedList', 'ol'],
  ['ListItem', 'li'],
  ['Emphasis', 'em'],
  ['StrongEmphasis', 'strong'],
  ['Strikethrough', 'del'],
  ['InlineCode', 'code'],
])

const BLOCK_CONTAINERS = new Set([
  'Blockquote',
  'BulletList',
  'Document',
  'ListItem',
  'OrderedList',
  'Table',
  'TableHeader',
  'TableRow',
])

const POSITIONED = new Set([
  ...HEADINGS.keys(),
  'Blockquote',
  'BulletList',
  'CodeBlock',
  'FencedCode',
  'HTMLBlock',
  'HorizontalRule',
  'OrderedList',
  'Paragraph',
  'Table',
])

function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = []
  const cursor = node.cursor()
  if (!cursor.firstChild()) return children

  do children.push(cursor.node)
  while (cursor.nextSibling())

  return children
}

function childNamed(node: SyntaxNode, name: string): SyntaxNode | null {
  return childrenOf(node).find((child) => child.name === name) ?? null
}

function textFrom(source: string, from: number, to: number): Text {
  return document.createTextNode(source.slice(from, to))
}

interface Walk {
  source: string
  references: ReadonlyMap<string, string>
  sanitise: SanitiseHtml
}

type Render = (node: SyntaxNode, walk: Walk) => Node | null

function labelOf(source: string, node: SyntaxNode): string {
  return source
    .slice(node.from + PAST_MARKER, node.to - PAST_MARKER)
    .trim()
    .toLowerCase()
}

function definedLabelOf(source: string, reference: SyntaxNode): string {
  const text = source.slice(reference.from, reference.to)

  return text.slice(PAST_MARKER, text.indexOf(LABEL_CLOSES)).trim().toLowerCase()
}

function referencesIn(root: SyntaxNode, source: string): Map<string, string> {
  const found = new Map<string, string>()

  for (const node of childrenOf(root)) {
    if (node.name !== 'LinkReference') continue

    for (const child of childrenOf(node)) {
      if (child.name === 'URL') found.set(definedLabelOf(source, node), destinationText(source, child))
    }
  }

  return found
}

function destinationText(source: string, url: SyntaxNode): string {
  return decodeDestination(source.slice(url.from, url.to))
}

function destinationOf(node: SyntaxNode, walk: Walk): string | null {
  const url = childNamed(node, 'URL')
  if (url !== null) return destinationText(walk.source, url)

  const label = childNamed(node, 'LinkLabel')
  const named = label === null ? '' : labelOf(walk.source, label)
  const wanted = named === '' ? textOfChildren(node, walk).trim().toLowerCase() : named

  return walk.references.get(wanted) ?? null
}

function textOfChildren(node: SyntaxNode, walk: Walk): string {
  const holder = document.createElement('span')
  appendChildren(holder, node, walk)

  return holder.textContent
}

function appendInlineTag(open: ParentNode, nesting: ParentNode[], source: string, walk: Walk): ParentNode {
  if (closesATag(source)) {
    const previous = nesting.pop()
    if (previous !== undefined) return previous

    open.append(codeElement(source, HTML_INFO))

    return open
  }

  const opened = openedBy(source, walk.sanitise)
  if (opened === null) {
    open.append(codeElement(source, HTML_INFO))

    return open
  }

  open.append(opened)
  if (holdsNothing(opened)) return open

  nesting.push(open)

  return opened
}

function appendChildren(into: ParentNode, node: SyntaxNode, walk: Walk): void {
  const { name, from: start, to: end } = node
  const gapsAreContent = !BLOCK_CONTAINERS.has(name)
  const nesting: ParentNode[] = []
  let open: ParentNode = into
  let at = start

  for (const child of childrenOf(node)) {
    const { from, to } = child
    if (gapsAreContent && from > at) open.append(textFrom(walk.source, at, from))
    at = to

    if (child.name === INLINE_TAG) {
      open = appendInlineTag(open, nesting, walk.source.slice(from, to), walk)
      continue
    }

    const rendered = renderNode(child, walk)
    if (rendered !== null) open.append(rendered)
  }

  if (gapsAreContent && end > at) open.append(textFrom(walk.source, at, end))
}

function positioned(tag: string, node: SyntaxNode): HTMLElement {
  const element = document.createElement(tag)
  element.dataset.from = String(node.from)
  element.dataset.to = String(node.to)

  return element
}

function elementFor(tag: string, node: SyntaxNode, walk: Walk): HTMLElement {
  const element = POSITIONED.has(node.name) ? positioned(tag, node) : document.createElement(tag)
  appendChildren(element, node, walk)

  return element
}

function trimmed(element: HTMLElement): HTMLElement {
  const { firstChild, lastChild } = element
  if (firstChild instanceof Text) firstChild.data = firstChild.data.trimStart()
  if (lastChild instanceof Text) lastChild.data = lastChild.data.trimEnd()

  return element
}

function codeTextOf(node: SyntaxNode, source: string): string {
  return childrenOf(node)
    .filter((child) => child.name === 'CodeText')
    .map((child) => source.slice(child.from, child.to))
    .join('')
}

function codeElement(code: string, info: string): HTMLElement {
  const element = document.createElement('code')
  const resolved = resolveLanguage(info)

  if (resolved === null) element.append(code)
  else {
    const { name, language } = resolved
    element.append(highlightCode(code, language))
    element.dataset.language = name
  }

  return element
}

function preformatted(code: string, info: string, node: SyntaxNode): HTMLElement {
  const block = positioned('pre', node)
  block.append(codeElement(code, info))

  return block
}

function renderCode(node: SyntaxNode, walk: Walk): HTMLElement {
  const info = childNamed(node, 'CodeInfo')

  return preformatted(codeTextOf(node, walk.source), info === null ? '' : walk.source.slice(info.from, info.to), node)
}

function renderLink(node: SyntaxNode, walk: Walk): Node {
  const destination = destinationOf(node, walk)
  const safe = destination === null ? null : safeDestination(destination)
  if (safe === null) {
    const fragment = document.createDocumentFragment()
    appendChildren(fragment, node, walk)

    return fragment
  }

  const anchor = document.createElement('a')
  anchor.setAttribute('href', safe)
  appendChildren(anchor, node, walk)

  return anchor
}

function renderAutolink(node: SyntaxNode, walk: Walk): Node {
  const destination = decodeDestination(walk.source.slice(node.from + PAST_MARKER, node.to - PAST_MARKER))
  const safe = safeDestination(destination)
  if (safe === null) return document.createTextNode(destination)

  const anchor = document.createElement('a')
  anchor.setAttribute('href', safe)
  anchor.append(destination)

  return anchor
}

function renderImage(node: SyntaxNode, walk: Walk): Node {
  const destination = destinationOf(node, walk)
  const safe = destination === null ? null : safeDestination(destination)
  const alt = textOfChildren(node, walk)
  if (safe === null) return document.createTextNode(alt)

  const image = document.createElement('img')
  image.setAttribute('src', safe)
  image.setAttribute('alt', alt)

  return image
}

function renderTask(node: SyntaxNode, walk: Walk): Node {
  const fragment = document.createDocumentFragment()
  const marker = childNamed(node, 'TaskMarker')
  const box = document.createElement('input')

  box.setAttribute('type', 'checkbox')
  box.setAttribute('disabled', '')
  if (marker !== null && walk.source.slice(marker.from, marker.to) !== '[ ]') box.setAttribute('checked', '')

  fragment.append(box)
  appendChildren(fragment, node, walk)

  return fragment
}

function renderTable(node: SyntaxNode, walk: Walk): HTMLElement {
  const table = positioned('table', node)
  const body = document.createElement('tbody')

  for (const row of childrenOf(node)) {
    if (row.name === 'TableHeader') {
      const head = document.createElement('thead')
      head.append(elementFor('tr', row, walk))
      table.append(head)
    } else if (row.name === 'TableRow') body.append(elementFor('tr', row, walk))
  }

  if (body.hasChildNodes()) table.append(body)

  return table
}

function renderCell(node: SyntaxNode, walk: Walk): HTMLElement {
  return trimmed(elementFor(node.parent?.name === 'TableHeader' ? 'th' : 'td', node, walk))
}

function renderRawBlock(node: SyntaxNode, walk: Walk): Node {
  const holder = positioned('div', node)
  holder.className = RAW_HTML_CLASS
  holder.append(walk.sanitise(walk.source.slice(node.from, node.to)))

  return holder
}

function renderRawInline(node: SyntaxNode, walk: Walk): Node {
  return codeElement(walk.source.slice(node.from, node.to), HTML_INFO)
}

function renderRule(node: SyntaxNode): Node {
  return positioned('hr', node)
}

function renderBreak(): Node {
  return document.createElement('br')
}

function renderEscape(node: SyntaxNode, walk: Walk): Node {
  return textFrom(walk.source, node.from + PAST_MARKER, node.to)
}

function renderEntity(node: SyntaxNode, walk: Walk): Node {
  return document.createTextNode(decodeEntity(walk.source.slice(node.from, node.to)))
}

function headingRenderers(): Array<[string, Render]> {
  return [...HEADINGS].map(([name, tag]) => [name, (node, walk) => trimmed(elementFor(tag, node, walk))])
}

function elementRenderers(): Array<[string, Render]> {
  return [...SIMPLE_ELEMENTS].map(([name, tag]) => [name, (node, walk) => elementFor(tag, node, walk)])
}

const RENDERERS: ReadonlyMap<string, Render> = new Map<string, Render>([
  ...headingRenderers(),
  ...elementRenderers(),
  ['Autolink', renderAutolink],
  ['CodeBlock', renderCode],
  ['Comment', renderRawInline],
  ['CommentBlock', renderRawBlock],
  ['Entity', renderEntity],
  ['Escape', renderEscape],
  ['FencedCode', renderCode],
  ['HTMLBlock', renderRawBlock],
  ['HardBreak', renderBreak],
  ['HorizontalRule', renderRule],
  ['Image', renderImage],
  ['Link', renderLink],
  ['ProcessingInstruction', renderRawInline],
  ['ProcessingInstructionBlock', renderRawBlock],
  ['Table', renderTable],
  ['TableCell', renderCell],
  ['Task', renderTask],
])

function renderNode(node: SyntaxNode, walk: Walk): Node | null {
  const render = RENDERERS.get(node.name)

  return render === undefined ? null : render(node, walk)
}

export function renderMarkdown(markdown: string, sanitise: SanitiseHtml = sanitiseHtml): DocumentFragment {
  const { topNode: root } = markdownParser.parse(markdown)
  const walk: Walk = { source: markdown, references: referencesIn(root, markdown), sanitise }
  const fragment = document.createDocumentFragment()

  appendChildren(fragment, root, walk)

  return fragment
}
