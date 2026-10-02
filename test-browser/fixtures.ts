'use sanity'

import { expect, type APIRequestContext, type Page } from '@playwright/test'

import { DECODABLE_64PX_PNG_BYTES } from './png.ts'
import { stringFieldOf } from './json.ts'

export function newDocument(name: string): string {
  return `/doc/${name}`
}

export async function storedDocument(request: APIRequestContext, name: string, content = '# seed'): Promise<string> {
  await request.post('/api/files/documents', { data: { path: name, content } })

  return newDocument(name)
}

export async function deletedEntry(request: APIRequestContext, name: string): Promise<string> {
  await request.post('/api/files/documents', { data: { path: name, content: '# gone' } })

  return await stringFieldOf(await request.delete(`/api/files/entries/${name}`), 'trashId')
}

export async function storedImage(request: APIRequestContext, name: string, directory = ''): Promise<string> {
  const stored = await request.post('/api/files/uploads', {
    multipart: { path: directory, file: { name, mimeType: 'image/png', buffer: DECODABLE_64PX_PNG_BYTES } },
  })
  expect(stored.status()).toBe(201)

  return `/doc/${await stringFieldOf(stored, 'path')}`
}

export async function openLayout(page: Page, width = 1200, height = 700): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.goto('/doc/')
  await expect(page.locator('.cm-editor')).toBeVisible()
}

export async function documentWithLink(request: APIRequestContext, folder: string): Promise<string> {
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: `${folder}/target.md`, content: '# the target' } })
  await request.post('/api/files/documents', {
    data: { path: `${folder}/source.md`, content: 'see [the target](target.md) for more\n\nplain prose below\n' },
  })

  return `/doc/${folder}/source.md`
}

export async function workspace(request: APIRequestContext, folder: string): Promise<string> {
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: `${folder}/notes.md`, content: '# notes\n' } })
  await request.post('/api/files/documents', { data: { path: `${folder}/other.md`, content: '# other\n' } })

  return `/doc/${folder}/notes.md`
}

export const RIBBON = '.ribbon'
export const EXPLORER = '#explorer'
export const WORKSPACE = '.workspace'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export async function boxOf(page: Page, selector: string): Promise<Box> {
  const found = await page.locator(selector).boundingBox()
  if (found === null) throw new Error(`${selector} should be laid out, but has no bounding box`)

  return found
}
