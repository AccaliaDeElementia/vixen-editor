'use sanity'

import { describe, expect, it } from 'vitest'

import { renderMarkdown } from '../../../../src/client/preview/render-markdown.ts'

const BLOCK_ORIGINS = / data-(?:from|to)="\d+"/gv

interface Conformance {
  construct: string
  source: string
  renders: string
}

function renderedHtml(markdown: string): string {
  const host = document.createElement('div')
  host.append(renderMarkdown(markdown))

  return host.innerHTML.replace(BLOCK_ORIGINS, '')
}

const COMMONMARK: readonly Conformance[] = [
  { construct: 'an ATX heading at each level it is given', source: '# a\n\n### c\n', renders: '<h1>a</h1><h3>c</h3>' },
  { construct: 'a setext heading underlined with equals', source: 'Title\n=====\n', renders: '<h1>Title</h1>' },
  { construct: 'a setext heading underlined with dashes', source: 'Title\n-----\n', renders: '<h2>Title</h2>' },
  {
    construct: 'emphasis and strong emphasis',
    source: '*a* **b**\n',
    renders: '<p><em>a</em> <strong>b</strong></p>',
  },
  {
    construct: 'emphasis inside a word with asterisks but not underscores',
    source: 'a*b*c and a_b_c\n',
    renders: '<p>a<em>b</em>c and a_b_c</p>',
  },
  { construct: 'a code span', source: 'a `b` c\n', renders: '<p>a <code>b</code> c</p>' },
  { construct: 'a hard break written as two spaces', source: 'one  \ntwo\n', renders: '<p>one<br>two</p>' },
  { construct: 'a hard break written as a backslash', source: 'one\\\ntwo\n', renders: '<p>one<br>two</p>' },
  { construct: 'a backslash escape, which holds its character', source: '\\*a\\* \\# b\n', renders: '<p>*a* # b</p>' },
  { construct: 'a named, numeric and unknown entity', source: '&amp; &copy; &#65;\n', renders: '<p>&amp; © A</p>' },
  { construct: 'a thematic break', source: '---\n', renders: '<hr>' },
  { construct: 'a blockquote', source: '> q\n', renders: '<blockquote><p>q</p></blockquote>' },
  {
    construct: 'a blockquote inside a blockquote',
    source: '> a\n> > b\n',
    renders: '<blockquote><p>a</p><blockquote><p>b</p></blockquote></blockquote>',
  },
  {
    construct: 'a loose bullet list, whose items hold paragraphs',
    source: '- a\n\n- b\n',
    renders: '<ul><li><p>a</p></li><li><p>b</p></li></ul>',
  },
  {
    construct: 'a loose ordered list',
    source: '1. a\n\n2. b\n',
    renders: '<ol><li><p>a</p></li><li><p>b</p></li></ol>',
  },
  {
    construct: 'a list item holding two paragraphs',
    source: '- a\n\n  continued\n',
    renders: '<ul><li><p>a</p><p>continued</p></li></ul>',
  },
  {
    construct: 'a fenced code block with no info string',
    source: '```\nx\n```\n',
    renders: '<pre><code>x</code></pre>',
  },
  { construct: 'an indented code block', source: '    let x = 1\n', renders: '<pre><code>let x = 1</code></pre>' },
  { construct: 'an inline link', source: '[a](/x)\n', renders: '<p><a href="/x">a</a></p>' },
  { construct: 'an inline image', source: '![a](/x.png)\n', renders: '<p><img src="/x.png" alt="a"></p>' },
  {
    construct: 'a reference link, whose definition leaves no output of its own',
    source: '[a][ref]\n\n[ref]: /x\n',
    renders: '<p><a href="/x">a</a></p>',
  },
  {
    construct: 'a reference image',
    source: '![a][ref]\n\n[ref]: /x.png\n',
    renders: '<p><img src="/x.png" alt="a"></p>',
  },
  {
    construct: 'a link whose title is in double quotes',
    source: '[a](/x "T")\n',
    renders: '<p><a href="/x" title="T">a</a></p>',
  },
  {
    construct: 'a link whose title is in single quotes',
    source: "[a](/x 'T')\n",
    renders: '<p><a href="/x" title="T">a</a></p>',
  },
  {
    construct: 'a link whose title is in parentheses',
    source: '[a](/x (T))\n',
    renders: '<p><a href="/x" title="T">a</a></p>',
  },
  {
    construct: 'a titled link whose text is marked up, which the title must not disturb',
    source: '[*a*](/x "T")\n',
    renders: '<p><a href="/x" title="T"><em>a</em></a></p>',
  },
  {
    construct: 'an image whose title sits beside its alt text',
    source: '![a](/x.png "T")\n',
    renders: '<p><img src="/x.png" alt="a" title="T"></p>',
  },
  {
    construct: 'a reference link whose definition carries a title',
    source: '[a][ref]\n\n[ref]: /x "T"\n',
    renders: '<p><a href="/x" title="T">a</a></p>',
  },
  {
    construct: 'a reference image whose definition carries a title',
    source: '![a][ref]\n\n[ref]: /x.png "T"\n',
    renders: '<p><img src="/x.png" alt="a" title="T"></p>',
  },
  {
    construct: 'a link whose destination is padded with spaces inside the parentheses',
    source: '[a]( /x )\n',
    renders: '<p><a href="/x">a</a></p>',
  },
  {
    construct: 'an image whose destination is padded, which must not reach the alt text',
    source: '![a]( /x.png )\n',
    renders: '<p><img src="/x.png" alt="a"></p>',
  },
  {
    construct: 'a padded destination carrying a title as well',
    source: '[a]( /x "T" )\n',
    renders: '<p><a href="/x" title="T">a</a></p>',
  },
  {
    construct: 'a link with no title, which gains no title attribute',
    source: '[a](/x)\n',
    renders: '<p><a href="/x">a</a></p>',
  },
  {
    construct: 'an autolink in angle brackets, whose text is its destination',
    source: '<https://example.com>\n',
    renders: '<p><a href="https://example.com">https://example.com</a></p>',
  },
]

const GFM: readonly Conformance[] = [
  {
    construct: 'a table, whose first row is its head',
    source: '| a | b |\n| - | - |\n| 1 | 2 |\n',
    renders: '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
  },
  {
    construct: 'inline markup inside a table cell',
    source: '| a |\n| - |\n| **b** `c` |\n',
    renders:
      '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td><strong>b</strong> <code>c</code></td></tr></tbody></table>',
  },
  {
    construct: 'a pipe escaped inside a table cell',
    source: '| a |\n| - |\n| x \\| y |\n',
    renders: '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>x | y</td></tr></tbody></table>',
  },
  {
    construct: 'a task list, checked and unchecked',
    source: '- [ ] a\n- [x] b\n',
    renders:
      '<ul><li><input type="checkbox" disabled=""> a</li><li><input type="checkbox" disabled="" checked=""> b</li></ul>',
  },
  {
    construct: 'a task list marked with a capital X',
    source: '- [X] b\n',
    renders: '<ul><li><input type="checkbox" disabled="" checked=""> b</li></ul>',
  },
  {
    construct: 'a task list item inside an ordered list',
    source: '1. [ ] a\n',
    renders: '<ol><li><input type="checkbox" disabled=""> a</li></ol>',
  },
  { construct: 'strikethrough between double tildes', source: '~~x~~\n', renders: '<p><del>x</del></p>' },
  { construct: 'strikethrough inside a word', source: 'a~~b~~c\n', renders: '<p>a<del>b</del>c</p>' },
]

describe('what CommonMark asks the preview to render', () => {
  it.each(COMMONMARK)('renders $construct', ({ source, renders }) => {
    expect(renderedHtml(source)).toBe(renders)
  })
})

describe('what the GFM extensions ask the preview to render', () => {
  it.each(GFM)('renders $construct', ({ source, renders }) => {
    expect(renderedHtml(source)).toBe(renders)
  })
})

describe('the fixture itself', () => {
  it('strips the block origins the editor needs, so a case states only what a reader sees', () => {
    expect(renderedHtml('# a\n')).toBe('<h1>a</h1>')
  })

  it('leaves a case failing when the markup differs, so the comparison is not vacuous', () => {
    expect(renderedHtml('# a\n')).not.toBe('<h2>a</h2>')
  })
})
