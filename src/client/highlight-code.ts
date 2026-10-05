'use sanity'

import { classHighlighter, highlightTree } from '@lezer/highlight'
import { StreamLanguage, type Language } from '@codemirror/language'
import { cssLanguage } from '@codemirror/lang-css'
import { htmlLanguage } from '@codemirror/lang-html'
import { javascriptLanguage, jsxLanguage, typescriptLanguage, tsxLanguage } from '@codemirror/lang-javascript'
import { markdownLanguage } from '@codemirror/lang-markdown'

import { c, cpp, java } from '@codemirror/legacy-modes/mode/clike'
import { commonLisp } from '@codemirror/legacy-modes/mode/commonlisp'
import { diff } from '@codemirror/legacy-modes/mode/diff'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { go } from '@codemirror/legacy-modes/mode/go'
import { python } from '@codemirror/legacy-modes/mode/python'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { rust } from '@codemirror/legacy-modes/mode/rust'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'

const LANGUAGES: ReadonlyMap<string, Language> = new Map([
  ['c', StreamLanguage.define(c)],
  ['cpp', StreamLanguage.define(cpp)],
  ['css', cssLanguage],
  ['diff', StreamLanguage.define(diff)],
  ['dockerfile', StreamLanguage.define(dockerFile)],
  ['go', StreamLanguage.define(go)],
  ['html', htmlLanguage],
  ['java', StreamLanguage.define(java)],
  ['javascript', javascriptLanguage],
  ['json', javascriptLanguage],
  ['jsx', jsxLanguage],
  ['lisp', StreamLanguage.define(commonLisp)],
  ['markdown', markdownLanguage],
  ['python', StreamLanguage.define(python)],
  ['ruby', StreamLanguage.define(ruby)],
  ['rust', StreamLanguage.define(rust)],
  ['shell', StreamLanguage.define(shell)],
  ['sql', StreamLanguage.define(standardSQL)],
  ['toml', StreamLanguage.define(toml)],
  ['tsx', tsxLanguage],
  ['typescript', typescriptLanguage],
  ['yaml', StreamLanguage.define(yaml)],
])

const ALIASES: ReadonlyMap<string, string> = new Map([
  ['bash', 'shell'],
  ['c++', 'cpp'],
  ['common-lisp', 'lisp'],
  ['docker', 'dockerfile'],
  ['elisp', 'lisp'],
  ['js', 'javascript'],
  ['md', 'markdown'],
  ['patch', 'diff'],
  ['py', 'python'],
  ['sh', 'shell'],
  ['ts', 'typescript'],
  ['yml', 'yaml'],
])

function named(info: string): string {
  const name = info.trim().toLowerCase()

  return ALIASES.get(name) ?? name
}

function languageFor(info: string): Language | null {
  return LANGUAGES.get(named(info)) ?? null
}

function token(text: string, classes: string): Node {
  if (classes === '') return document.createTextNode(text)

  const span = document.createElement('span')
  span.className = classes
  span.textContent = text

  return span
}

function highlightCode(code: string, language: Language | null): DocumentFragment {
  const fragment = document.createDocumentFragment()
  if (language === null) {
    fragment.append(code)

    return fragment
  }

  let at = 0
  highlightTree(language.parser.parse(code), classHighlighter, (from, to, classes) => {
    if (from > at) fragment.append(token(code.slice(at, from), ''))
    fragment.append(token(code.slice(from, to), classes))
    at = to
  })
  fragment.append(token(code.slice(at), ''))

  return fragment
}

export const TestOnly = { highlightCode, languageFor }
