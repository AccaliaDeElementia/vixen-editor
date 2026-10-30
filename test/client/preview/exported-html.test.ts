'use sanity'

import { describe, expect, it } from 'vitest'

import { exportedHtml } from '../../../src/client/preview/exported-html.ts'

function keepingWhatWasWritten(raw: string): DocumentFragment {
  const held = document.createElement('template')
  held.innerHTML = raw

  return held.content
}

describe('what the export leaves behind', () => {
  it('drops the offsets the preview carries so a click can reach the text', () => {
    expect(exportedHtml('# Title\n')).toBe('<h1>Title</h1>')
  })

  it('drops the language the preview marks on a code block', () => {
    expect(exportedHtml('```js\nlet x\n```\n')).not.toContain('data-language')
  })

  it('emits code as it was written, rather than as the spans that colour it', () => {
    expect(exportedHtml('```js\nconst x = 1\n```\n')).toBe('<pre><code>const x = 1</code></pre>')
  })

  it('carries no class at all, because every class the preview writes is this editor own plumbing', () => {
    const everything = '# Title\n\n```js\nconst x = 1\n```\n\n- [x] done\n\n| a |\n| --- |\n| 1 |\n'

    expect(exportedHtml(everything)).not.toContain('class=')
  })

  it('keeps the raw html a document wrote, without the wrapper the preview puts round it', () => {
    expect(exportedHtml('<div>shouted</div>\n', keepingWhatWasWritten)).toBe('<div>shouted</div>')
  })
})

describe('what the export keeps', () => {
  it('keeps the structure the document described', () => {
    expect(exportedHtml('## Second\n\nprose\n')).toBe('<h2>Second</h2><p>prose</p>')
  })

  it('keeps a link where it pointed', () => {
    expect(exportedHtml('[there](other.md)\n')).toBe('<p><a href="other.md">there</a></p>')
  })

  it('leaves an image source as the document wrote it, because the export travels with the store', () => {
    expect(exportedHtml('![alt](pictures/moon.png)\n')).toBe('<p><img src="pictures/moon.png" alt="alt"></p>')
  })

  it('keeps a task list as checkboxes, which are markup rather than plumbing', () => {
    expect(exportedHtml('- [x] done\n')).toBe('<ul><li><input type="checkbox" disabled="" checked=""> done</li></ul>')
  })

  it('keeps a table whole', () => {
    expect(exportedHtml('| a |\n| --- |\n| 1 |\n')).toBe(
      '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
    )
  })
})
