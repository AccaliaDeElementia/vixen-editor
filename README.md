# vixen-editor

A self-hosted markdown editor. It serves a browser editor over a small HTTP API
and keeps every document as an ordinary file on disk, so the store stays
readable, greppable and backup-able with the tools you already have.

- [What it is](#readme-6e4b78)
- [Running it](#readme-2f7a01)
- [Configuration](#readme-83d9c4)
- [Addressing a document](#readme-b1e550)
- [Browser support](#readme-c93f2a)
- [Extracting a downloaded archive](#readme-4a7e19)
- [Working on it](#readme-d05b6c)

<a id="readme-6e4b78"></a>

## What it is

- **Your files stay files.** Documents are `.md` and `.txt` on disk, in the
  folders you put them in. Nothing is wrapped in a database and nothing rewrites
  what you wrote.
- **A file browser beside the editor.** Create, rename, move, upload and
  download; drag a file in to upload it, drag one onto the document to link it.
- **Deleting is recoverable.** A delete moves the entry to a trash area you can
  list and restore from, rather than removing bytes.
- **Images work the way markdown expects.** `![](./photo.png)` resolves against
  the document's own folder, so an exported tree opens correctly somewhere else.
- **Concurrent edits are refused, not silently merged.** A save carries the
  version it was based on; if the file changed underneath you, the editor offers
  the choice instead of overwriting.
- **One process, one volume.** There is no cluster mode and no external
  dependency.

<a id="readme-2f7a01"></a>

## Running it

The image builds from the `Dockerfile` in this repository and runs the editor on
port 3000, serving documents from a volume at `/data/docs`:

```
docker build -t vixen-editor .
docker run -p 3000:3000 -v /path/to/your/documents:/data/docs vixen-editor
```

Then open `http://localhost:3000/`.

The container runs as a non-root user, and `/data/docs` is created with that
user's ownership so a bind mount is writable without elevating anything. A
health check polls `/api/health`.

**A single process is the supported deployment.** Two containers sharing one
volume will not corrupt documents — every write lands whole or not at all — but
the lock that serialises concurrent saves is in-process, so running two gains
nothing and protects less than it appears to.

<a id="readme-83d9c4"></a>

## Configuration

Every setting is an environment variable, and every one has a default.

| Variable                | Default       | What it does                                                    |
| ----------------------- | ------------- | --------------------------------------------------------------- |
| `DOCS_ROOT`             | `./data/docs` | where documents live                                            |
| `PORT`                  | `3000`        | the port to listen on                                           |
| `HOST`                  | `0.0.0.0`     | the address to bind                                             |
| `UPLOAD_MAX_BYTES`      | 25 MiB        | largest file you can upload                                     |
| `ARCHIVE_MAX_BYTES`     | 100 MiB       | largest download archive, measured before it is built           |
| `ARCHIVE_MAX_ENTRIES`   | 2000          | most files in one download archive                              |
| `WRITE_LOCK_TIMEOUT_MS` | 5000          | how long a save waits its turn before reporting the editor busy |
| `DEBUG`                 | unset         | diagnostic logging; `vixen-editor:*` for everything             |

`DEBUG` is off unless you set it, and the editor never writes to the console
otherwise. Setting it in a `.env` file beside the process works as well as
exporting it in the shell.

<a id="readme-b1e550"></a>

## Addressing a document

A document is addressed by its path under `/doc/`:

```
http://localhost:3000/doc/journal/2026/march.md
```

A folder is addressed the same way and always keeps its trailing slash, which is
what makes a relative link inside the document resolve against the right folder.
Visiting the root redirects to `/doc/`.

Any name is allowed except ones that cannot work: nothing hidden, nothing with a
path separator or control character, nothing that is only whitespace, and
nothing over 255 bytes. Spaces, apostrophes, accented letters, CJK and emoji are
all fine.

<a id="readme-c93f2a"></a>

## Browser support

| Browser | From |
| ------- | ---- |
| Chrome  | 119  |
| Firefox | 147  |
| Safari  | 26.2 |

Below the floor the editor does not degrade gracefully — the file dialogs throw
outright — so it is a floor rather than a recommendation.

<a id="readme-4a7e19"></a>

## Extracting a downloaded archive

A download is a faithful copy of your tree: the names in the zip are the names
on disk, unchanged.

Linux allows filenames Windows does not — `< > : " | ? *`, a trailing dot, and
the device names such as `CON` and `NUL`. If your store holds one, **Windows
Explorer will refuse to extract the archive**. 7-Zip and similar tools
substitute the offending characters at extraction time and show you what they
changed, so use one of those. The editor will not create such a name itself; one
can only arrive from another tool writing into the document root.

<a id="readme-d05b6c"></a>

## Working on it

Keyboard shortcuts are listed in the editor's own help dialog, which is the one
place they are recorded.

For how the project is built, see [DESIGN.md](DESIGN.md). For how it is tested,
see [TESTING.md](TESTING.md). For the rules an AI agent working in this
repository must follow, see [CLAUDE.md](CLAUDE.md).
