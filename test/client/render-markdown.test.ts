'use sanity'

import { describe, expect, it } from 'vitest'

import { renderMarkdown } from '../../src/client/render-markdown.ts'
import { SCRIPT_URL } from './hostile-urls.ts'

function sanitiserAllowing(): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const allowed = document.createElement('em')
  allowed.textContent = 'allowed'
  fragment.append(allowed)

  return fragment
}

function render(markdown: string, sanitise?: (raw: string) => DocumentFragment): HTMLElement {
  const host = document.createElement('div')
  host.append(sanitise === undefined ? renderMarkdown(markdown) : renderMarkdown(markdown, sanitise))

  return host
}

function sanitisedInto(markdown: string, selector: string): Element | null {
  return render(markdown, sanitiserAllowing).querySelector(selector)
}

function tagsIn(markdown: string): string[] {
  return [...render(markdown).querySelectorAll('*')].map((element) => element.tagName.toLowerCase())
}

function asOneLine(text: string): string {
  return text.replace(/\s+/gv, ' ')
}

function textOf(markdown: string, selector: string): string {
  return render(markdown).querySelector(selector)?.textContent ?? ''
}

describe('headings', () => {
  it('renders a hash heading at its level', () => {
    expect(tagsIn('### Third')).toStrictEqual(['h3'])
  })

  it('leaves the marker out of the text', () => {
    expect(textOf('# Title here', 'h1')).toBe('Title here')
  })

  it('renders a setext heading, whose marker comes after the text', () => {
    expect(textOf('Title\n=====', 'h1')).toBe('Title')
  })

  it('renders the second setext level', () => {
    expect(tagsIn('Title\n-----')).toStrictEqual(['h2'])
  })

  it('renders marked-up text inside a heading', () => {
    expect(tagsIn('# A **bold** title')).toStrictEqual(['h1', 'strong'])
  })
})

describe('paragraphs and inline markup', () => {
  it('renders a paragraph', () => {
    expect(tagsIn('Just prose.')).toStrictEqual(['p'])
  })

  it('renders emphasis', () => {
    expect(textOf('A *word* here', 'em')).toBe('word')
  })

  it('renders strong emphasis', () => {
    expect(textOf('A **word** here', 'strong')).toBe('word')
  })

  it('renders a strikethrough, which is an extension this app turns on', () => {
    expect(textOf('A ~~word~~ here', 'del')).toBe('word')
  })

  it('renders inline code without its backticks', () => {
    expect(textOf('A `snippet` here', 'code')).toBe('snippet')
  })

  it('keeps the text around the markup', () => {
    expect(textOf('A **bold** word', 'p')).toBe('A bold word')
  })

  it('renders a hard break', () => {
    expect(tagsIn('one  \ntwo')).toStrictEqual(['p', 'br'])
  })

  it('renders an escaped character as the character itself', () => {
    expect(textOf('a \\* star', 'p')).toBe('a * star')
  })

  it('decodes a named entity', () => {
    expect(textOf('this &amp; that', 'p')).toBe('this & that')
  })

  it('decodes a numeric entity', () => {
    expect(textOf('a &#65; letter', 'p')).toBe('a A letter')
  })

  it('leaves an entity it does not know as the reader wrote it', () => {
    expect(textOf('a &nosuchthing; here', 'p')).toBe('a &nosuchthing; here')
  })
})

describe('block structure', () => {
  it('renders a blockquote', () => {
    expect(tagsIn('> quoted')).toStrictEqual(['blockquote', 'p'])
  })

  it('leaves the quote markers out of a quote spanning lines', () => {
    expect(asOneLine(textOf('> one\n> two', 'blockquote p'))).toBe('one two')
  })

  it('renders a bullet list', () => {
    expect(tagsIn('- one\n- two')).toStrictEqual(['ul', 'li', 'p', 'li', 'p'])
  })

  it('renders an ordered list', () => {
    expect(tagsIn('1. one')).toStrictEqual(['ol', 'li', 'p'])
  })

  it('nests a list inside its parent item', () => {
    expect(render('- outer\n  - inner').querySelectorAll('li ul li')).toHaveLength(1)
  })

  it('keeps the markup between an item and its text out of the item', () => {
    expect(textOf('- one\n- two', 'li')).toBe('one')
  })

  it('puts no stray text between the rows of a table, where only cells belong', () => {
    const table = render('| a | b |\n| - | - |\n| 1 | 2 |').querySelector('table')

    expect([...(table?.childNodes ?? [])].filter((node) => node instanceof Text)).toStrictEqual([])
  })

  it('renders a horizontal rule', () => {
    expect(tagsIn('---')).toStrictEqual(['hr'])
  })

  it('writes none of the rule’s own characters into the page, because a break is not a word', () => {
    expect(render('before\n\n---\n\nafter').textContent).toBe('beforeafter')
  })
})

describe('task lists', () => {
  it('renders an unticked task as a checkbox', () => {
    expect(render('- [ ] todo').querySelector('input')?.getAttribute('type')).toBe('checkbox')
  })

  it('renders a ticked task as checked', () => {
    expect(render('- [x] done').querySelector('input')?.hasAttribute('checked')).toBe(true)
  })

  it('leaves the checkbox read-only, because the preview does not edit', () => {
    expect(render('- [ ] todo').querySelector('input')?.hasAttribute('disabled')).toBe(true)
  })

  it('keeps the task text beside the checkbox', () => {
    expect(textOf('- [ ] todo', 'li')).toContain('todo')
  })

  it('leaves the marker out of the text', () => {
    expect(textOf('- [ ] todo', 'li')).not.toContain('[ ]')
  })
})

describe('tables', () => {
  it('renders the header cells as headings', () => {
    expect(textOf('| a | b |\n| - | - |\n| 1 | 2 |', 'thead th')).toBe('a')
  })

  it('renders the body cells', () => {
    expect(textOf('| a | b |\n| - | - |\n| 1 | 2 |', 'tbody td')).toBe('1')
  })

  it('renders markup inside a cell, which fills the cell entirely', () => {
    expect(textOf('| a | b |\n| - | - |\n| **x** | 2 |', 'tbody td strong')).toBe('x')
  })

  it('renders a table with a header and no rows under it', () => {
    expect(render('| a | b |\n| - | - |').querySelectorAll('tbody')).toHaveLength(0)
  })

  it('leaves the separator row out, since it is markup rather than content', () => {
    expect(render('| a | b |\n| - | - |\n| 1 | 2 |').querySelectorAll('tr')).toHaveLength(2)
  })
})

describe('links and images', () => {
  it('renders a link to its destination', () => {
    expect(render('[text](./a.md)').querySelector('a')?.getAttribute('href')).toBe('./a.md')
  })

  it('renders the link text', () => {
    expect(textOf('[text](./a.md)', 'a')).toBe('text')
  })

  it('renders an autolink, whose text is its destination', () => {
    expect(textOf('<https://example.test/x>', 'a')).toBe('https://example.test/x')
  })

  it('renders an image to its source', () => {
    expect(render('![alt](./p.png)').querySelector('img')?.getAttribute('src')).toBe('./p.png')
  })

  it('gives an image its alt text', () => {
    expect(render('![alt](./p.png)').querySelector('img')?.getAttribute('alt')).toBe('alt')
  })

  it('resolves a reference link against its definition', () => {
    expect(render('[text][id]\n\n[id]: ./a.md').querySelector('a')?.getAttribute('href')).toBe('./a.md')
  })

  it('renders nothing for the definition itself, which is markup rather than content', () => {
    expect(tagsIn('[id]: ./a.md')).toStrictEqual([])
  })

  it('resolves a shortcut reference, whose own text is the label', () => {
    expect(render('[foo]\n\n[foo]: ./a.md').querySelector('a')?.getAttribute('href')).toBe('./a.md')
  })

  it('resolves a collapsed reference the same way', () => {
    expect(render('[foo][]\n\n[foo]: ./a.md').querySelector('a')?.getAttribute('href')).toBe('./a.md')
  })

  it('leaves an image whose reference is missing as its alt text', () => {
    expect(textOf('![alt][missing]', 'p')).toBe('alt')
  })

  it('leaves a reference with no definition as plain text', () => {
    expect(tagsIn('[text][missing]')).toStrictEqual(['p'])
  })
})

describe('a destination the browser must not be handed', () => {
  it('refuses a javascript: link, which is the sharpest vector markdown itself offers', () => {
    expect(tagsIn(`[click](${SCRIPT_URL})`)).toStrictEqual(['p'])
  })

  it('keeps the text of a refused link, so the document still reads', () => {
    expect(textOf(`[click](${SCRIPT_URL})`, 'p')).toBe('click')
  })

  it('refuses a data: image, which can carry script in an SVG', () => {
    expect(tagsIn('![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)')).toStrictEqual(['p'])
  })

  it('refuses a vbscript: link', () => {
    expect(tagsIn('[click](vbscript:msgbox)')).toStrictEqual(['p'])
  })

  it('refuses an autolink carrying a javascript: scheme, which markdown also permits', () => {
    expect(tagsIn(`<${SCRIPT_URL}>`)).toStrictEqual(['p'])
  })

  it('keeps the text of a refused autolink', () => {
    expect(textOf(`<${SCRIPT_URL}>`, 'p')).toBe(SCRIPT_URL)
  })

  it('allows an ordinary http destination', () => {
    expect(render('[x](http://example.test/)').querySelector('a')?.getAttribute('href')).toBe('http://example.test/')
  })

  it('allows a mailto destination', () => {
    expect(render('[x](mailto:a@example.test)').querySelector('a')?.getAttribute('href')).toBe('mailto:a@example.test')
  })

  it('allows a relative destination, which is what documents in the store use', () => {
    expect(render('[x](../a.md)').querySelector('a')?.getAttribute('href')).toBe('../a.md')
  })
})

describe('code', () => {
  it('renders a fenced block as code', () => {
    expect(tagsIn('```\nplain\n```').slice(0, 2)).toStrictEqual(['pre', 'code'])
  })

  it('keeps the code text', () => {
    expect(textOf('```\nplain text\n```', 'pre code')).toBe('plain text')
  })

  it('renders an indented block as code', () => {
    expect(textOf('    indented\n    lines', 'pre code')).toBe('indented\nlines')
  })

  it('highlights a fenced block whose info string names a language', () => {
    expect(render('```lisp\n(defun f (x) x)\n```').querySelectorAll('pre code span').length).toBeGreaterThan(0)
  })

  it('records the language it used, so a reader can see what was assumed', () => {
    expect(render('```lisp\n(f)\n```').querySelector('pre code')?.getAttribute('data-language')).toBe('lisp')
  })

  it('resolves an alias to the language it names', () => {
    expect(render('```py\nx = 1\n```').querySelector('pre code')?.getAttribute('data-language')).toBe('python')
  })

  it('renders an info string it does not know as plain text rather than failing', () => {
    expect(textOf('```foobar\nsome code\n```', 'pre code')).toBe('some code')
  })

  it('leaves code with an unknown language unhighlighted', () => {
    expect(render('```foobar\nsome code\n```').querySelectorAll('span')).toHaveLength(0)
  })

  it('leaves inline code unhighlighted, since a backtick span carries no language', () => {
    expect(render('`x = 1`').querySelectorAll('code span')).toHaveLength(0)
  })
})

describe('raw HTML in a block, which the sanitiser decides about', () => {
  it('hands the block to the sanitiser exactly as the document wrote it', () => {
    const seen: string[] = []

    renderMarkdown('<div class="raw">hi</div>', (raw) => {
      seen.push(raw)

      return document.createDocumentFragment()
    })

    expect(seen).toStrictEqual(['<div class="raw">hi</div>'])
  })

  it('renders what the sanitiser gave back rather than the source', () => {
    expect(sanitisedInto('<div>hi</div>', 'em')?.textContent).toBe('allowed')
  })

  it('records where the block came from, so scrolling can find it', () => {
    expect(render('<div>hi</div>', sanitiserAllowing).querySelector('.markup__html')?.getAttribute('data-from')).toBe(
      '0',
    )
  })

  it('hands a script block over too, rather than deciding for itself', () => {
    const seen: string[] = []

    renderMarkdown('<script>window.pwned = 1</script>', (raw) => {
      seen.push(raw)

      return document.createDocumentFragment()
    })

    expect(seen).toStrictEqual(['<script>window.pwned = 1</script>'])
  })

  it('creates nothing at all when the sanitiser allows nothing', () => {
    expect(render('<img src=x onerror="window.pwned = 1">').querySelector('img')).toBeNull()
  })
})

function sanitiserAllowingSpans(source: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  if (source.includes('span')) fragment.append(document.createElement('span'))
  if (source.includes('br')) fragment.append(document.createElement('br'))

  return fragment
}

describe('raw HTML written inline', () => {
  it('becomes the element the sanitiser allowed', () => {
    expect(render('a <span>b</span> c', sanitiserAllowingSpans).querySelector('p span')?.textContent).toBe('b')
  })

  it('keeps the text around it outside', () => {
    const paragraph = render('a <span>b</span> c', sanitiserAllowingSpans).querySelector('p')

    expect(asOneLine(paragraph?.textContent ?? '')).toBe('a b c')
  })

  it('goes on rendering the markdown written inside it', () => {
    expect(render('a <span>**b**</span> c', sanitiserAllowingSpans).querySelector('span strong')?.textContent).toBe('b')
  })

  it('closes where the reader closed it, so what follows is outside', () => {
    expect(render('a <span>b</span> c', sanitiserAllowingSpans).querySelector('span')?.textContent).toBe('b')
  })

  it('holds nothing when the tag is one that cannot, so what follows stays outside', () => {
    expect(render('a <br> c', sanitiserAllowingSpans).querySelector('br')?.textContent).toBe('')
  })

  it('shows a tag the sanitiser refuses as source instead', () => {
    expect(render('a <script>b</script> c').querySelector('code')?.textContent).toBe('<script>')
  })

  it('shows the closing tag of a refused one as source too, rather than swallowing it', () => {
    expect(asOneLine(textOf('a <script>b</script> c', 'p'))).toBe('a <script>b</script> c')
  })

  it('shows a closing tag that closes nothing as source', () => {
    expect(asOneLine(textOf('a </span> c', 'p'))).toBe('a </span> c')
  })

  it('shows an inline comment as source', () => {
    expect(textOf('text <!-- note --> more', 'p')).toBe('text <!-- note --> more')
  })

  it('shows an inline processing instruction as source', () => {
    expect(textOf('a <?php echo 1; ?> b', 'p')).toBe('a <?php echo 1; ?> b')
  })
})

describe('where a block came from, for scrolling', () => {
  it('records the source offset of a block', () => {
    expect(render('# Title').querySelector('h1')?.getAttribute('data-from')).toBe('0')
  })

  it('records where the block ends', () => {
    expect(render('# Title').querySelector('h1')?.getAttribute('data-to')).toBe('7')
  })

  it('records the offset of a block that does not start the document', () => {
    expect(render('# Title\n\nprose').querySelector('p')?.getAttribute('data-from')).toBe('9')
  })

  it('leaves inline markup unmarked, since scrolling is by block', () => {
    expect(render('A **bold** word').querySelector('strong')?.hasAttribute('data-from')).toBe(false)
  })
})

describe('an empty document', () => {
  it('renders nothing at all', () => {
    expect(tagsIn('')).toStrictEqual([])
  })
})

describe('an entity naming a character that does not exist', () => {
  it('is left as the reader wrote it rather than throwing', () => {
    expect(textOf('a &#9999999; here', 'p')).toBe('a &#9999999; here')
  })
})
