'use sanity'

import { stemOf } from '../../shared/link-paths.ts'

import { exportedHtml } from './exported-html.ts'

const HTML_MEDIA_TYPE = 'text/html;charset=utf-8'
const SAVED_AS = '.html'

interface Saving {
  entryPath: string
  markdown: string
}

function titleMarkup(name: string): string {
  const title = document.createElement('title')
  title.textContent = name

  return title.outerHTML
}

function htmlDocumentOf({ entryPath, markdown }: Saving): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    titleMarkup(stemOf(entryPath)),
    '</head>',
    '<body>',
    exportedHtml(markdown),
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

function toTheDownloads(file: File): void {
  const { name } = file
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function saveAsHtml(saving: Saving, save: (file: File) => void = toTheDownloads): void {
  const name = `${stemOf(saving.entryPath)}${SAVED_AS}`

  save(new File([htmlDocumentOf(saving)], name, { type: HTML_MEDIA_TYPE }))
}

export const TestOnly = { htmlDocumentOf }
