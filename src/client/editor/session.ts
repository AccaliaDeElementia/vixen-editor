'use sanity'

import { DocumentRequestError, type DocumentClient } from './document-client.ts'

const HTTP_NOT_FOUND = 404

export interface Session {
  load: (id: string) => Promise<string>
  save: (id: string, content: string) => Promise<void>
  rename: (from: string, to: string) => void
}

function isAbsent(error: unknown): boolean {
  return error instanceof DocumentRequestError && error.status === HTTP_NOT_FOUND
}

function defaultTemplate(id: string): string {
  const name = id.slice(id.lastIndexOf('/') + 1).replace(/\.[^./]+$/u, '')
  return `# ${name}\n\nTODO: start writing.\n`
}

export function createSession(client: DocumentClient, template: (id: string) => string = defaultTemplate): Session {
  const etags = new Map<string, string>()

  return {
    async load(id: string): Promise<string> {
      try {
        const { content, etag } = await client.read(id)
        etags.set(id, etag)
        return content
      } catch (error) {
        if (!isAbsent(error)) throw error

        etags.delete(id)
        return template(id)
      }
    },

    // A move leaves the content untouched, so the etag is still the right one
    // for the bytes on disk — only the name it is filed under changed. If the
    // move also repaired links, the etag is stale and the save answers 412,
    // which is the correct loud outcome rather than a silent overwrite.
    rename(from: string, to: string): void {
      const etag = etags.get(from)
      etags.delete(from)
      if (etag !== undefined) etags.set(to, etag)
    },

    // A document with no etag was never on the server, so the first save has to
    // create it; every later save carries the etag the previous one returned.
    async save(id: string, content: string): Promise<void> {
      const etag = etags.get(id)
      const next = etag === undefined ? await client.create(id, content) : await client.save(id, content, etag)

      etags.set(id, next)
    },
  }
}

export const TestOnly = { defaultTemplate }
