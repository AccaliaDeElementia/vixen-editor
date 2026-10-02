'use sanity'

import { markdown } from '@codemirror/lang-markdown'
import { parser } from '@lezer/markdown'
import { describe, expect, it } from 'vitest'

import { destinationsIn, VIXEN_MARKDOWN_EXTENSIONS } from '../../../src/shared/markdown-tree.ts'

const { language: clientLanguage } = markdown({ extensions: VIXEN_MARKDOWN_EXTENSIONS })
const { parser: clientParser } = clientLanguage
const serverParser = parser.configure(VIXEN_MARKDOWN_EXTENSIONS)

const CORPUS: Readonly<Record<string, string>> = {
  inline: 'see [a](./one.md) here\n',
  image: '![alt](./pic.png)\n',
  bracketed: '[a](<my pic.png>)\n',
  definition: '[a][id]\n\n[id]: ./two.md "t"\n',
  nested: '[![alt](inner.png)](outer.md)\n',
  titled: '[a](./one.md "the title")\n',
  encoded: '[a](my%20file.md)\n',
  escaped: '[a](a\\ b.md)\n',
  parenthesised: '[a](a(b).md)\n',
  emptyDestination: '[a]()\n',
  emptyBrackets: '[a](<>)\n',
  autolink: '<https://example.com/x.md>\n',
  htmlImage: '<img src="./r.png">\n',
  inlineCode: 'use `[a](code.md)` here\n',
  fenced: '```\n[a](fence.md)\n```\n',
  tildeFenced: '~~~\n[a](t.md)\n~~~\n',
  unterminatedFence: '```\n[a](never.md)\n',
  indented: '    [a](indent.md)\n',
  table: '| a | [x](t.md) |\n|---|---|\n',
  taskList: '- [ ] [x](task.md)\n',
  strikethrough: '~~[a](s.md)~~\n',
  list: '- [a](one.md)\n- [b](two.md)\n',
  blockquote: '> [a](quote.md)\n',
  heading: '## [a](head.md)\n',
  setext: 'Title\n=====\n\n[a](one.md)\n',
  emphasis: '*[a](em.md)*\n',
  hardBreak: 'x  \n[a](one.md)\n',
  crlf: '[a](crlf.md)\r\n\r\n[id]: crlf2.md\r\n',
  noTrailingNewline: '[a](no-newline.md)',
  definitionThatIsOnlyText: '- item\n<img src="./r.png">\n[c]: ./ref.md',
  footnoteShaped: 'text[^1]\n\n[^1]: ./fn.md\n',
  duplicateLabels: '[a]: ./one.md\n[a]: ./two.md\n',
  spacedLabel: '[ a ]: ./sp.md\n',
  whitespaceInParens: '[a](  ./sp.md  )\n',
  htmlBlock: '<div>\n[a](./one.md)\n</div>\n',
  manyLinks: '[a](1.md) [b](2.md) [c](3.md)\n\n[id]: 4.md\n',
}

describe('the client and the server read the same document the same way', () => {
  it.each(Object.entries(CORPUS))('agrees on the %s document', (_name, document) => {
    const onClient = destinationsIn(clientParser.parse(document), document)
    const onServer = destinationsIn(serverParser.parse(document), document)

    expect(onClient).toStrictEqual(onServer)
  })

  it.each([
    ['the server parser', serverParser],
    ['the client parser', clientParser],
  ])('finds destinations at all with %s, so agreeing on nothing cannot pass', (_label, parser) => {
    const document = '[a](1.md) [b](2.md) [c](3.md)\n\n[id]: 4.md\n'

    expect(destinationsIn(parser.parse(document), document).map((d) => d.value)).toStrictEqual([
      '1.md',
      '2.md',
      '3.md',
      '4.md',
    ])
  })
})
