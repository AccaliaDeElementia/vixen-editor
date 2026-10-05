'use sanity'

import pug from 'pug'

import { archiveUrlFor } from '../../src/shared/api.ts'
import { STORE_ROOT } from '../../src/shared/store-path.ts'

const TEMPLATES = 'src/templates'

const BODY = /<body[^>]*>(?<markup>[\s\S]*)<\/body>/v

function bodyOf(html: string): string {
  const { markup } = BODY.exec(html)?.groups ?? {}
  if (markup === undefined) throw new Error('the rendered page has no body')

  return markup
}

export function renderPage(): string {
  return bodyOf(
    pug.renderFile(`${TEMPLATES}/editor.pug`, { title: 'vixen-editor', archiveUrl: archiveUrlFor(STORE_ROOT) }),
  )
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
