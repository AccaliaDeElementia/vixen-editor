'use sanity'

import pug from 'pug'

const TEMPLATES = 'src/templates'

const BODY = /<body[^>]*>(?<markup>[\s\S]*)<\/body>/v
const SCRIPT = /<script[^>]*>[\s\S]*?<\/script>/gv

function bodyOf(html: string): string {
  const { markup } = BODY.exec(html)?.groups ?? {}
  if (markup === undefined) throw new Error('the rendered page has no body')

  return markup
}

function withoutTheEntryPoint(markup: string): string {
  return markup.replace(SCRIPT, '')
}

export function renderPage(): string {
  return withoutTheEntryPoint(bodyOf(pug.renderFile(`${TEMPLATES}/editor.pug`, { title: 'vixen-editor' })))
}

export function renderDialog(): string {
  return pug.renderFile(`${TEMPLATES}/_dialog.pug`)
}

export function renderSection(selector: string): string {
  const host = document.createElement('div')
  host.innerHTML = renderPage()
  const section = host.querySelector(selector)
  if (section === null) throw new Error(`${selector} is not in the rendered page`)

  return section.outerHTML
}

export function renderPane(primary = false): string {
  return pug.render('include _pane.pug\n+pane(primary)', { filename: `${TEMPLATES}/pane-only.pug`, primary })
}
