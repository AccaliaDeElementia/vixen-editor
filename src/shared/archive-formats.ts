'use sanity'

export type ArchiveFormat = 'zip' | 'tar.gz'

const ARCHIVE_FORMATS: readonly ArchiveFormat[] = ['zip', 'tar.gz']

export function archiveFormatNamed(asked: string): ArchiveFormat | null {
  return ARCHIVE_FORMATS.find((format) => format === asked) ?? null
}
