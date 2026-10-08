'use sanity'

import { describe, expect, it } from 'vitest'
import type { Language } from '@codemirror/language'

import { tags } from '@lezer/highlight'

import { highlightCode, resolveLanguage } from '../../src/client/highlight-code.ts'
import { vixenHighlightStyle } from '../../src/client/highlight.ts'

function languageFor(info: string): Language | null {
  return resolveLanguage(info)?.language ?? null
}

function rendered(code: string, info: string): HTMLElement {
  const host = document.createElement('pre')
  host.append(highlightCode(code, languageFor(info)))

  return host
}

function classesIn(code: string, info: string): string[] {
  return [...rendered(code, info).querySelectorAll('span')].flatMap((span) => span.className.split(' '))
}

function editorClassFor(tag: (typeof tags)['heading']): string {
  return vixenHighlightStyle.style([tag]) ?? ''
}

describe('choosing a language by its info string', () => {
  it('knows one by name', () => {
    expect(languageFor('lisp')).not.toBeNull()
  })

  it('knows one by a common alias', () => {
    expect(languageFor('js')).toBe(languageFor('javascript'))
  })

  it('ignores the case and the spaces around it', () => {
    expect(languageFor('  Python ')).toBe(languageFor('python'))
  })

  it('answers nothing for a name it does not know, rather than guessing', () => {
    expect(languageFor('foobar')).toBeNull()
  })

  it('answers nothing when there is no info string at all', () => {
    expect(languageFor('')).toBeNull()
  })
})

describe('highlighting code', () => {
  it('marks a keyword in a language with its own grammar', () => {
    expect(classesIn('const x = 1', 'javascript')).toContain('tok-keyword')
  })

  it('marks a keyword in a language that came from a stream mode', () => {
    expect(classesIn('(defun square (x) x)', 'lisp')).toContain('tok-keyword')
  })

  it('marks a comment, which is what tells prose from code at a glance', () => {
    expect(classesIn('# a note\nx = 1', 'python')).toContain('tok-comment')
  })

  it('reads json through the javascript grammar, which already ships', () => {
    expect(classesIn('{"n": 42}', 'json')).toContain('tok-number')
  })

  it('marks a type annotation, which only the typescript grammar sees', () => {
    expect(classesIn('const x: number = 1', 'typescript')).toContain('tok-typeName')
  })

  it('marks an attribute in html, which is what the raw-source view leans on', () => {
    expect(classesIn('<p class="x">hi</p>', 'html')).toContain('tok-propertyName')
  })

  it('leaves code in an unknown language entirely alone', () => {
    expect(classesIn('const x = 1', 'foobar')).toStrictEqual([])
  })

  it('still shows code in an unknown language', () => {
    expect(rendered('const x = 1', 'foobar').textContent).toBe('const x = 1')
  })
})

describe('what highlighting must never do', () => {
  const SAMPLES: ReadonlyArray<readonly [string, string]> = [
    ['javascript', 'const x = 1 // note\nlet y = "two"\n'],
    ['lisp', '(defun square (x) ;; doc\n  (* x x))'],
    ['python', 'def f():\n    return 1  # one\n'],
    ['html', '<p class="x">hi</p>\n<!-- gone -->'],
    ['markdown', '# title\n\n- item\n\n`code` and [link](a.md)\n'],
    ['yaml', 'key: value\nlist:\n  - one\n'],
    ['json', '{"a": [1, 2], "b": null}'],
    ['foobar', 'whatever this is'],
  ]

  it.each(SAMPLES)('gives back every character of %s unchanged', (info, code) => {
    expect(rendered(code, info).textContent).toBe(code)
  })

  it('keeps a trailing newline, which a walk that stops at the last token would drop', () => {
    expect(rendered('const x = 1\n\n', 'javascript').textContent).toBe('const x = 1\n\n')
  })

  it('keeps leading whitespace, which indentation depends on', () => {
    expect(rendered('    indented = 1', 'python').textContent).toBe('    indented = 1')
  })

  it('renders nothing for empty code rather than failing', () => {
    expect(rendered('', 'javascript').textContent).toBe('')
  })
})

describe('agreeing with the editor about how markdown looks', () => {
  it('marks a heading with the class the editor gives a heading, rather than an unstyled name', () => {
    expect(classesIn('# A heading', 'markdown')).toContain(editorClassFor(tags.heading))
  })

  it('marks a link the same way, so a preview and the editor beside it cannot disagree', () => {
    expect(classesIn('[a link](x.md)', 'markdown')).toContain(editorClassFor(tags.link))
  })
})
