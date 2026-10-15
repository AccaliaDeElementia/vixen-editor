'use sanity'

import { describe, expect, it } from 'vitest'

import { givenAsync } from '../../conditions.ts'
import { someone } from '../actors.ts'
import { compareNames } from '../../../src/server/storage/primitives/name-order.ts'
import type { StoreLayer } from '../../../src/server/storage/fs-store.ts'
import {
  ConcurrentModificationError,
  DocumentNotFoundError,
  EntryExistsError,
} from '../../../src/server/storage/primitives/store-errors.ts'
import { InvalidPathError } from '../../../src/server/storage/primitives/safe-path.ts'
import { FOLDER_INDEX_NAME } from '../../../src/shared/documents.ts'

export function storeContract(subject: () => StoreLayer): void {
  describe('read', () => {
    it('returns the stored content', async () => {
      await subject().createDocument('notes.md', 'content', someone)

      await expect(subject().read('notes.md')).resolves.toBe('content')
    })

    it('throws DocumentNotFoundError for a missing document', async () => {
      await expect(subject().read('missing.md')).rejects.toThrow(DocumentNotFoundError)
    })

    it('names the missing document in the error', async () => {
      await expect(subject().read('missing.md')).rejects.toThrow(/missing\.md/v)
    })

    it('rejects an invalid id', async () => {
      await expect(subject().read('../../etc/passwd.md')).rejects.toThrow(InvalidPathError)
    })
  })

  describe('list', () => {
    it('returns an empty array when there are no documents', async () => {
      await expect(subject().list(compareNames)).resolves.toStrictEqual([])
    })

    it('lists documents sorted by id', async () => {
      await subject().createDocument('b.md', 'x', someone)
      await subject().createDocument('a.md', 'x', someone)

      await expect(subject().list(compareNames)).resolves.toStrictEqual(['a.md', 'b.md'])
    })

    it('lists them the way a reader counts, so file9 comes before file10', async () => {
      await subject().createDocument('file10.md', 'x', someone)
      await subject().createDocument('file9.md', 'x', someone)

      await expect(subject().list(compareNames)).resolves.toStrictEqual(['file9.md', 'file10.md'])
    })

    it('lists nested documents with posix separators', async () => {
      await subject().createDocument('journal/2026/september.md', 'x', someone)

      await expect(subject().list(compareNames)).resolves.toStrictEqual(['journal/2026/september.md'])
    })

    it('lists plain text alongside markdown, because both are documents', async () => {
      await subject().createDocument('notes.md', 'x', someone)
      await subject().createDocument('notes.txt', 'x', someone)

      await expect(subject().list(compareNames)).resolves.toStrictEqual(['notes.md', 'notes.txt'])
    })
  })

  describe('createDocument', () => {
    it('creates a document with the content it was given', async () => {
      await subject().createDocument('notes.md', '# seeded', someone)

      await expect(subject().read('notes.md')).resolves.toBe('# seeded')
    })

    it('creates missing parent directories', async () => {
      await subject().createDocument('journal/2026/september.md', 'entry', someone)

      await expect(subject().read('journal/2026/september.md')).resolves.toBe('entry')
    })

    it('refuses to replace an existing document', async () => {
      await subject().createDocument('notes.md', 'original', someone)

      await expect(subject().createDocument('notes.md', 'replacement', someone)).rejects.toThrow(EntryExistsError)
    })

    it('leaves the existing content untouched when it refuses', async () => {
      await subject().createDocument('notes.md', 'original', someone)

      await givenAsync(
        expect(subject().createDocument('notes.md', 'replacement', someone)).rejects.toThrow(EntryExistsError),
      )

      await expect(subject().read('notes.md')).resolves.toBe('original')
    })

    it('names the taken path in the error', async () => {
      await subject().createDocument('notes.md', 'original', someone)

      await expect(subject().createDocument('notes.md', 'x', someone)).rejects.toThrow(/notes\.md/v)
    })

    it('rejects an invalid id', async () => {
      await expect(subject().createDocument('../escape.md', 'x', someone)).rejects.toThrow(InvalidPathError)
    })

    it('round-trips unicode content', async () => {
      await subject().createDocument('unicode.md', '# ✨ héllo 世界', someone)

      await expect(subject().read('unicode.md')).resolves.toBe('# ✨ héllo 世界')
    })

    it('stores a plain text document', async () => {
      await subject().createDocument('notes.txt', 'plain', someone)

      await expect(subject().read('notes.txt')).resolves.toBe('plain')
    })

    it('returns an etag the caller can save against', async () => {
      const etag = await subject().createDocument('notes.md', '# hello', someone)

      await expect(subject().updateDocument('notes.md', '# changed', etag, someone)).resolves.toBeTruthy()
    })
  })

  describe('updateDocument', () => {
    async function seeded(content = 'original'): Promise<string> {
      return await subject().createDocument('notes.md', content, someone)
    }

    it('replaces the content when the etag matches', async () => {
      const etag = await seeded()

      await subject().updateDocument('notes.md', 'replaced', etag, someone)

      await expect(subject().read('notes.md')).resolves.toBe('replaced')
    })

    it('returns an etag matching the new content, so a second save needs no re-read', async () => {
      const etag = await seeded()

      const next = await subject().updateDocument('notes.md', 'replaced', etag, someone)
      await subject().updateDocument('notes.md', 'again', next, someone)

      await expect(subject().read('notes.md')).resolves.toBe('again')
    })

    it('rejects a stale etag rather than clobbering the newer content', async () => {
      const stale = await seeded()
      await subject().updateDocument('notes.md', 'someone else got here first', stale, someone)

      await expect(subject().updateDocument('notes.md', 'mine', stale, someone)).rejects.toThrow(
        ConcurrentModificationError,
      )
    })

    it('leaves the newer content in place when it rejects a stale etag', async () => {
      const stale = await seeded()
      await subject().updateDocument('notes.md', 'theirs', stale, someone)

      await givenAsync(
        expect(subject().updateDocument('notes.md', 'mine', stale, someone)).rejects.toThrow(
          ConcurrentModificationError,
        ),
      )

      await expect(subject().read('notes.md')).resolves.toBe('theirs')
    })

    it('rejects an etag for entirely different content', async () => {
      await seeded()

      await expect(subject().updateDocument('notes.md', 'mine', '"not-an-etag"', someone)).rejects.toThrow(
        ConcurrentModificationError,
      )
    })

    it('refuses to create a document that does not exist, which is what the create endpoint is for', async () => {
      await expect(subject().updateDocument('absent.md', 'x', '"whatever"', someone)).rejects.toThrow(
        DocumentNotFoundError,
      )
    })

    it('rejects an invalid id', async () => {
      await expect(subject().updateDocument('../escape.md', 'x', '"e"', someone)).rejects.toThrow(InvalidPathError)
    })

    it('lets only one of two concurrent saves holding the same etag through', async () => {
      const etag = await subject().createDocument('notes.md', 'original', someone)

      const outcomes = await Promise.allSettled([
        subject().updateDocument('notes.md', 'first writer', etag, someone),
        subject().updateDocument('notes.md', 'second writer', etag, someone),
      ])

      expect(outcomes.map((outcome) => outcome.status).toSorted()).toStrictEqual(['fulfilled', 'rejected'])
    })

    it('reports the loser of two concurrent saves as a conflict, not as a silent success', async () => {
      const etag = await subject().createDocument('notes.md', 'original', someone)

      const outcomes = await Promise.allSettled([
        subject().updateDocument('notes.md', 'first writer', etag, someone),
        subject().updateDocument('notes.md', 'second writer', etag, someone),
      ])
      const rejection = outcomes.find((outcome) => outcome.status === 'rejected')

      expect(rejection?.reason).toBeInstanceOf(ConcurrentModificationError)
    })
  })

  describe('createFolder', () => {
    it('seeds the folder with an index document, so it opens to something', async () => {
      await subject().createFolder('journal', '# journal', someone)

      await expect(subject().read(`journal/${FOLDER_INDEX_NAME}`)).resolves.toBe('# journal')
    })

    it('creates missing parent directories', async () => {
      await subject().createFolder('journal/2026/september', '# september', someone)

      await expect(subject().read(`journal/2026/september/${FOLDER_INDEX_NAME}`)).resolves.toBe('# september')
    })

    it('refuses a folder that already exists, rather than overwriting its index', async () => {
      await subject().createFolder('journal', '# journal', someone)

      await expect(subject().createFolder('journal', '# again', someone)).rejects.toThrow(EntryExistsError)
    })

    it('leaves the existing index untouched when it refuses', async () => {
      await subject().createFolder('journal', '# journal', someone)

      await givenAsync(expect(subject().createFolder('journal', '# again', someone)).rejects.toThrow(EntryExistsError))

      await expect(subject().read(`journal/${FOLDER_INDEX_NAME}`)).resolves.toBe('# journal')
    })

    it('refuses a path already occupied by a file', async () => {
      await subject().createDocument('journal.md', 'x', someone)

      await expect(subject().createFolder('journal.md', '# journal', someone)).rejects.toThrow(EntryExistsError)
    })

    it('rejects an invalid path', async () => {
      await expect(subject().createFolder('../escape', '# x', someone)).rejects.toThrow(InvalidPathError)
    })
  })

  describe('the name rules every implementation shares', () => {
    it('refuses a name over the byte limit, which the filesystem counts in bytes rather than characters', async () => {
      await expect(subject().createDocument(`${'a'.repeat(253)}.md`, 'x', someone)).rejects.toThrow(InvalidPathError)
    })

    it('accepts a name of exactly the limit, so the refusal above is the limit and not a smaller one', async () => {
      await expect(subject().createDocument(`${'a'.repeat(252)}.md`, 'x', someone)).resolves.toBeDefined()
    })

    it('counts an emoji as its four bytes, so a short-looking name can still be refused', async () => {
      await expect(subject().createDocument(`${'\u{1F389}'.repeat(64)}.md`, 'x', someone)).rejects.toThrow(
        InvalidPathError,
      )
    })

    it('refuses a name that is not normalised, so two spellings cannot become two documents', async () => {
      await expect(subject().createDocument('cafe\u0301.md', 'x', someone)).rejects.toThrow(InvalidPathError)
    })

    it('refuses an unnormalised upload name too, since a client chooses that one as well', async () => {
      await expect(subject().createUpload('', 'cafe\u0301.png', new Uint8Array([1]), someone)).rejects.toThrow(
        InvalidPathError,
      )
    })
  })

  describe('tree', () => {
    it('reports the document tree', async () => {
      await subject().createDocument('journal/september.md', 'x', someone)

      await expect(subject().tree(compareNames)).resolves.toMatchObject([
        { name: 'journal', kind: 'folder', children: [{ name: 'september.md', kind: 'document' }] },
      ])
    })

    it('reports an empty tree for an empty root', async () => {
      await expect(subject().tree(compareNames)).resolves.toStrictEqual([])
    })
  })

  describe('createUpload', () => {
    const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

    it('returns the stored path, which the client turns into a relative link', async () => {
      await expect(subject().createUpload('journal', 'photo.png', PNG, someone)).resolves.toBe('journal/photo.png')
    })

    it('stores at the root when no directory is given', async () => {
      await expect(subject().createUpload('', 'photo.png', PNG, someone)).resolves.toBe('photo.png')
    })

    it('creates missing parent directories', async () => {
      await expect(subject().createUpload('journal/2026', 'photo.png', PNG, someone)).resolves.toBe(
        'journal/2026/photo.png',
      )
    })

    it('refuses to replace an existing file', async () => {
      await subject().createUpload('', 'photo.png', PNG, someone)

      await expect(subject().createUpload('', 'photo.png', PNG, someone)).rejects.toThrow(EntryExistsError)
    })

    it('rejects a filename carrying a separator, so an upload cannot pick its own directory', async () => {
      await expect(subject().createUpload('journal', '../escape.png', PNG, someone)).rejects.toThrow(InvalidPathError)
    })

    it('accepts a markdown upload, which carries no signature to check', async () => {
      const markdown = new TextEncoder().encode('# imported')

      await expect(subject().createUpload('', 'imported.md', markdown, someone)).resolves.toBe('imported.md')
    })
  })

  describe('readBytes', () => {
    const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7])

    it('round-trips an upload byte for byte', async () => {
      await subject().createUpload('', 'photo.png', PNG, someone)

      await expect(subject().readBytes('photo.png')).resolves.toStrictEqual(PNG)
    })

    it('reads a document as bytes too', async () => {
      await subject().createDocument('notes.md', '# hello', someone)

      await expect(
        subject()
          .readBytes('notes.md')
          .then((b) => new TextDecoder().decode(b)),
      ).resolves.toBe('# hello')
    })

    it('throws DocumentNotFoundError for a missing file', async () => {
      await expect(subject().readBytes('missing.png')).rejects.toThrow(DocumentNotFoundError)
    })

    it('rejects a traversal attempt', async () => {
      await expect(subject().readBytes('../../etc/passwd.png')).rejects.toThrow(InvalidPathError)
    })
  })
}
