'use sanity'

import createDOMPurify from 'dompurify'

export type SanitiseHtml = (raw: string) => DocumentFragment

const ALLOWED_TAGS = [
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'u',
  'ul',
  'var',
]

const ALLOWED_ATTR = [
  'alt',
  'cite',
  'colspan',
  'datetime',
  'dir',
  'href',
  'lang',
  'open',
  'rowspan',
  'src',
  'start',
  'title',
]

const purify = createDOMPurify(globalThis.window)

export function sanitiseHtml(raw: string): DocumentFragment {
  return purify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  })
}

export const TestOnly = { ALLOWED_ATTR, ALLOWED_TAGS }
