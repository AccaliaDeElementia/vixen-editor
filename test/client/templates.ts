'use sanity'

import pug from 'pug'

import { archiveUrlFor } from '../../src/shared/api.ts'
import { STORE_ROOT } from '../../src/shared/store-path.ts'

const TEMPLATES = 'src/templates'

function bodyOf(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.innerHTML
}

export function renderPage(): string {
  return bodyOf(
    pug.renderFile(`${TEMPLATES}/editor.pug`, { title: 'vixen-editor', archiveUrl: archiveUrlFor(STORE_ROOT) }),
  )
}

export function renderDialog(): string {
  return pug.renderFile(`${TEMPLATES}/_dialog.pug`)
}
