# vixen-editor

A markdown editor: a Hono API serving a VanillaJS + CodeMirror 6 front end, with
documents persisted to the filesystem.

## Ground rules

These are not suggestions. They take precedence over habit and over what the
surrounding ecosystem commonly does.

### 1. Git mutation is the human's job

Read-only git is fine and encouraged:

- `git log`, `git show`, `git diff`, `git status`, `git blame`
- `git branch` / `git branch -a` (listing), `git stash list`, `git remote -v`

Never run, and never ask to run:

- `git commit`, `git add`, `git restore --staged`, `git reset` (staging or otherwise)
- `git pull`, `git push`, `git fetch`
- `git checkout -b`, `git switch -c`, `git branch <name>`, `git branch -d`
- `git stash push`, `git stash pop`, `git stash apply`, `git stash drop`
- `git merge`, `git rebase`, `git cherry-pick`, `git revert`

When work is ready to commit, say so and stop. The human stages and commits.

### 2. Every authored `.ts` and `.js` file starts with `'use sanity'`

The first line of the file, followed by a blank line, then imports:

```ts
'use sanity'

import path from 'node:path'
```

The only exception is a file whose external tooling forbids the syntax. No such
file exists in this repo today; if one appears, note why at the point of use.

**Consequence: do not create type-only modules.** In a module that declares
nothing but types, the directive is the sole surviving runtime statement, and
nothing ever imports it at runtime because `import type` is erased — so it
reports 0% coverage of that one line and breaks the coverage gate.

Declare an interface in the module that owns its primary implementation and
export it from there (`DocumentStore` lives in `src/server/storage/fs-store.ts`). A shared
contract that genuinely spans client and server should be defined by zod
schemas, which are runtime values, so it will not be type-only either. Adding a
coverage exclusion to work around this is the wrong fix — it carves a permanent
hole in the gate to accommodate a file that did not need to exist.

### 3. `export default` is forbidden

Use named exports. The only permitted uses are where external tooling requires a
default export, which currently means exactly three files:

- `vitest.config.ts`
- `eslint.config.js`
- `test-browser/playwright.config.ts`

### 4. Prefer function declarations over arrow constants

```ts
export function resolveDocumentPath(root: string, id: string): string { ... }
```

not

```ts
export const resolveDocumentPath = (root: string, id: string): string => { ... }
```

This applies to module-scope functions, exported or not. Arrow functions remain
correct for inline callbacks (`.map`, `.filter`, event handlers) and for
genuinely anonymous values.

### 5. Comments are a last resort

Comments drift from the code they describe; names, types and tests do not.
Encode intent in the structure instead: rename the variable, extract the
predicate, tighten the type, or write the test that demonstrates the behaviour.

A comment is justified in exactly two cases:

1. **External facts not discoverable from this codebase.** For example, that
   WebP cannot encode dimensions above 16383px, that `NAME_MAX` is 255 so a
   longer filename yields `ENAMETOOLONG`, or that a third-party package sets a
   particular default. If reading this repo end to end would not reveal it, it
   may be a comment.

2. **Tooling suppressions** (`eslint-disable-*`, `v8 ignore`). These must
   _always_ carry a human-readable rationale explaining what prompted the
   suppression. A bare suppression is not acceptable.

Design rationale is not an external fact. If the reason a `StateField` was
chosen over a `ViewPlugin` matters, the test that would fail under the other
choice is the place to record it.

Project-wide policy belongs in this file, not in code comments.

## Commands

**`npm test` is the gate.** It is what CI and the Docker build run, and it must
pass before work is handed back.

There is deliberately no second, stricter command. The obvious lever is the
correct one: a narrower `npm test` that quietly skipped type-checking and
coverage would make "tests pass" mean less than it says.

It is wired through npm's `pretest` hook, so the order is:

```
pretest:  format  →  typecheck  →  lint
test:     test:coverage
```

Note `pretest` runs `format`, not `format:check` — the gate **rewrites** files to
Prettier style rather than failing on drift, so there is never a formatting
failure to fix by hand.

That hook fires only for the exact script name `test`. **`npm run test:unit`
and `npm run test:coverage` bypass the static checks** — which is the point of
them, but it means a green `test:coverage` is not a green gate.

| Command                 | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `npm test`              | **The gate.** pretest (format, types, lint) then coverage      |
| `npm run test:all`      | The gate plus the browser suite; needs browser binaries        |
| `npm run test:unit`     | Vitest alone, no coverage — for a tight edit loop              |
| `npm run test:watch`    | Vitest in watch mode                                           |
| `npm run test:coverage` | Vitest with the 100% threshold enforced                        |
| `npm run test:browser`  | Playwright, real Chromium, against built artifacts             |
| `npm run build`         | esbuild: server to `dist/`, client to `public/assets/`         |
| `npm run dev`           | Watch every source dir; rebuild and restart on change          |
| `npm run format`        | Rewrite files to Prettier style (the fix for a format failure) |
| `npm run lint:fix`      | Apply ESLint autofixes                                         |

`test:unit` is the shortcut, and it is named so that reaching for it is a
deliberate choice rather than an accident.

### Suggested: tee the output

When running the suite, it is usually worth keeping the full log around:

```
npm test 2>&1 | tee run.log
```

The terminal shows a summary; `run.log` keeps everything, so a failure buried
above the fold can be read back without re-running. `*.log` is gitignored. This
is a convenience, not a rule — skip it for a quick `test:unit` loop.

## Response headers

**Every response carries `X-Clacks-Overhead: GNU Terry Pratchett`** — success,
error, static asset, 404, all of it. The constants live in `src/server/app.ts`
and are exported so tests assert the same strings the implementation uses.

The header is set in a single `app.use('*', …)` registered in `buildApp` before
the routes. One registration is enough: it covers routes added later in
`createApp`, sub-apps mounted with `app.route()`, and static-asset 404s.

**It must be set _after_ `next()`, inside a `finally`.** Setting it before
`next()` looks equivalent and is not:

| Placement                      | 200 | 500 | HTTPException | 404 |
| ------------------------------ | --- | --- | ------------- | --- |
| after `next()`, in a `finally` | ✅  | ✅  | ✅            | ✅  |
| before `next()`                | ✅  | ✅  | ❌            | ✅  |

`HTTPException.getResponse()` builds a fresh `Response` that never sees headers
buffered earlier in the request — and that is the path a malformed JSON body
takes, so the gap is reachable from any client. `test/server/clacks.test.ts`
covers that case specifically.

## UI state

Explorer width and open/closed state persist in **`localStorage`** under
`vixen-editor:explorer`, via `src/client/layout/preferences.ts`.

`localStorage`, not `sessionStorage`: sessionStorage is cleared when the tab
closes, so a width would survive a reload but not a browser relaunch — losing
it on relaunch is the behaviour this exists to avoid.

**Stored widths are clamped on _read_, not only on write.** Storage outlives
the window it was written in: a width saved on a wide monitor can exceed 80% of
a laptop viewport on the next load and would push the editor off-screen. The
same clamp handles a corrupted oversized value, so the two cases need no
separate handling.

`readPreferences` and `writePreferences` are **total** — merely reaching for
`localStorage` throws when site data is blocked, so even the property access is
guarded. Malformed JSON, the wrong shape, and negative / `NaN` / infinite
widths all fall back to the defaults. A blocked or full quota costs a
remembered width, never a working editor.

On load the page paints at the `20em` CSS default and snaps to the stored width
once the bundle runs. That flicker is accepted: removing it needs an inline
`<head>` script, which would put layout logic outside eslint, tsc and the
coverage gate.

**Grid columns are placed explicitly** (`grid-column: 1/2/3`). When the
explorer is hidden it leaves the grid flow entirely, and with auto-placement
the workspace slides into the collapsed `0`-width track and the editor vanishes.

## URLs

**A document is addressed by its path: `/doc/<path>`.** The root redirects to
`/doc/`, and a folder URL that arrives without a trailing slash is redirected
to one. Both redirects are `302`, never `301` — a permanent redirect is cached
indefinitely and this scheme may still move.

Bare paths at the root were considered and rejected. The reserved list was
never going to stay small: `/favicon.ico`, `/robots.txt`, `/.well-known/`
(ACME renewal breaks without it), `/sw.js`, `/manifest.json`, and every future
page such as `/settings`. Each would **silently shadow a document of the same
name**. With a prefix there are no reserved document names at all. GitLab
shipped bare paths, hit this, and retrofitted `/-/`.

**A folder URL always carries its trailing slash** because relative links are
resolved against it. At `/doc/journal/2026` a link to `./image.png` resolves
to `/doc/journal/image.png` — the wrong directory. At `/doc/journal/2026/` it
resolves correctly.

Whether a leaf is a folder is decided by `classifyFile`, not by looking for a
dot: a folder named `v1.2` has an extension and is still a folder.

## The document store

### `.md` and `.txt` are the same thing

One document family, in two coats. Anything that accepts one accepts the
other, including the listing. A format that the listing shows but the reader
refuses is the fault described below.

### What a name may be

`isAllowedName` in `src/server/storage/safe-path.ts` is the **single** answer
to "may this name exist here", used both by the path validator and by the
walks that decide what to list. Two answers is what let a file be listed and
then refused when opened — a real defect, hit by a document with a space in
its name.

Rejected in a path segment:

| Rejected                                      | Why                                                                |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `/` and `\`                                   | Separators. `\` breaks the moment an export is unzipped on Windows |
| `\p{Cc}`                                      | Control characters corrupt logs and terminal output                |
| `\p{Cf}` except U+200D                        | Bidi overrides and zero-width characters; the spoofing class       |
| A zero-width joiner outside an emoji sequence | Its only legitimate use is joining emoji                           |
| `.` and `..`                                  | Traversal                                                          |
| A leading dot                                 | Hidden files, and it is how `.trash` stays unreachable             |
| Empty, whitespace-only, or space-padded       | `notes.md` and `notes .md` are indistinguishable in a tree         |
| Over 255 UTF-8 **bytes**                      | `NAME_MAX` counts bytes: 64 emoji is 256                           |

Everything else is allowed — spaces, apostrophes, ampersands, brackets,
accented letters, CJK, emoji including joined sequences.

**The character set was never the traversal defence.** Separator rejection,
`.`/`..` rejection, `path.resolve` containment and the realpath check in
`assertResolvesInsideRoot` are. They are layered: with all the rules in place
`../secrets.md` is refused as a relative segment; delete that rule and the
leading-dot rule refuses it; delete both and the containment check does. That
last one carries a `v8 ignore` saying it is unreachable, which is true only
while the rules above it hold.

**Unicode normalisation is required only where the client chooses a name** —
create, upload, move destination. Reads, listings and move sources pass the
bytes on disk through untouched. Normalising a lookup would hide a decomposed
name written by another tool, which is the same fault as the listing and the
validator disagreeing.

### Never rewrite stored content

The API stores what it is given and returns what it stored. `![](./image.png)`
keeps working in an exported tree opened elsewhere only because nothing
rewrites it: resolution to `/api/files/raw/…` happens in the preview
transformer, never on disk.

Three obligations keep that true: never rewrite content, have upload return
the stored path so the client inserts a _relative_ link, and keep raw URLs
mirroring store paths so the transform stays a prefix.

#### The one exception: a move repairs the links it broke

A move rewrites markdown link and image destinations, and nothing else does.
The exception is deliberately narrow, and each part of it is load-bearing:

- **Only a move.** It is a user action with a visible result, never a side
  effect of a save, a read, an upload or an export. Nothing else in the API
  may rewrite content.
- **Only what the move broke.** A destination is repaired when the path it
  resolves to moved, or when the document holding it moved so the path it was
  written relative to is gone. Links that were already broken stay broken —
  repairing those would be a different feature, and a guessing one.
- **Only markdown link syntax.** `<a href>` and `<img src>` inside embedded
  HTML are left alone. Chasing them means parsing HTML inside markdown.
- **Never inside code.** A path in a fenced or indented block, or in inline
  code, is being documented rather than linked. This is why the feature uses a
  real parser instead of a regex, and `src/server/markdown/links.ts` gets that
  for free from micromark's token stream.

**The invariant that makes it safe: rewriting with an identity function
returns the document byte-identical.** A destination is only ever spliced when
its resolved target actually changed, so the written form — `./b.md`,
`my%2Dfile.md`, `sub/../b.md`, an angle-bracketed path — is preserved exactly
as authored. The module never normalises, and its tests hold a corpus of
deliberately non-canonical documents to keep that honest.

`POST /api/files/moves` answers `200 { rewritten, failed }`, naming documents
at their paths _after_ the move, so a client can tell an open editor that its
content moved underneath it.

**Link repair is per document and never fails the move.** By the time links
are repaired the move has already happened, so a document that cannot be read
or written must not strand the rest half-repaired: it goes in `failed` and the
pass carries on. That path is reported rather than only logged, because a link
left broken is exactly what the person who moved the file needs to know. A
document that fails is left byte-identical, since a failed atomic write
changes nothing.

**Documents are enumerated before the move, not after.** A document is
relinked against the path it held when its links were written, and after the
move that path is gone. The mapping also cannot be inverted: a merge leaves
the destination holding both moved and pre-existing files with nothing to tell
them apart.

### Every write lands whole

Nothing in `src/` calls `writeFile` on a store path. Writes go through
`replaceFileAtomic` or `createFileAtomic` in `src/server/storage/atomic-write.ts`,
which write a sibling temporary, `fsync` it, then put it in place with
`rename` (replace) or `link` (create only, `EEXIST` when the name is taken).
`link` is not interchangeable with `rename` here: `rename` would silently
clobber. `test/conventions/project-rules.test.ts` fails the gate on a direct
write anywhere else.

The point is the failure mode, not the happy path. A truncating in-place write
that is interrupted leaves **half a document** — the editor's own content,
destroyed by the editor. Through a temporary, the previous version survives
every failure, and the caller is told the write failed.

**Cleanup covers filling the temporary, not just putting it in place.** The
file exists from the moment it is opened, so a failure part way through
writing it is a different case from a failure to create it — and `ENOSPC` is
that case. A temporary leaked there consumes the very space whose exhaustion
caused the failure, so each failed save would make the next one likelier.

**Removing the temporary is cleanup, not part of the write.** Whether it
succeeds says nothing about whether the data landed, so a failing `fs.rm` is
logged and swallowed: propagating it would replace a real `ENOSPC` with a
misleading `EIO`, or report failure for a file `link` had already created —
which a client would then retry into a confusing `ALREADY_EXISTS`.

`handle.close` is deliberately **not** treated that way. A close that fails is
a write that failed — on NFS that is where a deferred write error surfaces —
and the caller has to hear about it.

So a `.vixen-*.tmp` outlives its write in exactly two cases: a killed process,
and a cleanup that could not delete it. Nothing collects those orphans yet — a
recorded follow-up, and a startup sweep is the only thing that can, since a
crashed instance is not around to tidy up after itself.

Which makes the name load-bearing. `isAllowedName` refuses a leading dot, so
an orphan is invisible to the tree, the document list and the archive rather
than appearing as a mystery document. It carries **no part of the target's
name**, because a name of exactly `NAME_MAX` bytes is legal here and anything
derived from it would exceed the limit and fail a write the validator had
accepted.

Both helpers are on one filesystem by construction — the temporary is a
sibling — since `rename` and `link` both require that.

### Deleting goes to the trash

`.trash/<uuid>/` holds `meta.json` and a payload under the fixed name
`payload`. Fixed, because a folder may legitimately be called `meta.json` and
would otherwise collide with the metadata beside it.

Entry ids are UUIDs, which is what keeps a caller-supplied id out of the
filesystem path. Deleting the same path twice yields two entries. A damaged
entry is skipped by the listing rather than breaking it.

There is **one** delete. `DELETE /api/documents/:id` was removed so that
existence is managed in one place.

### Moving

Overwrite checks are **per file and recursive**: two directories merge, so
only the leaves where something non-mergeable already sits are losses. A move
that would lose nothing simply happens; one that would lose something returns
`WOULD_OVERWRITE` **naming every path**, so the client can show them rather
than asking a vague question.

Overwritten files go to the trash first, so a mistaken confirmation is
recoverable, and a failure while trashing leaves the move itself untouched.

**A merge into an existing folder is not atomic.** A move to a path that does
not exist is one `rename`; merging moves entries individually and can
partially complete. The write lock stops other callers interleaving, but
serialisation is not atomicity — a crash mid-merge leaves a partial state.
`EXDEV` is an error, never a copy that half-succeeds.

A rename may not change what a file claims to be: the raw route types a
response from the extension alone, so `notes.md` cannot become `notes.svg`.

**A move reads every document in the store**, because a link from anywhere can
point at the thing that moved, and it does so inside the write lock along with
the move itself. That makes the lock hold time scale with the store rather
than with the move, which is the one thing about this design worth knowing
before the store gets large:

| Documents | Store  | Move + relink |
| --------- | ------ | ------------- |
| 100       | 0.5 MB | ~0.12 s       |
| 1000      | 5.5 MB | ~1.0 s        |
| 5000      | 27 MB  | ~4.8 s        |

Parsing dominates, at roughly half the total; the atomic writes are most of
the rest. At around 5000 documents this approaches the 5 s lock timeout, past
which a concurrent save gets `503 BUSY`. Reading outside the lock and taking
it only to write was measured and rejected: it roughly halves the hold time
without changing the shape of the curve, and it reopens the exact
read-modify-write window the lock exists to close.

## Concurrency

### Saves carry an ETag

`GET` returns `ETag: "<sha256 of content>"`; `PUT` requires `If-Match` and
answers `412` on a stale token, `428` when the header is absent. A client that
forgets the header fails loudly rather than silently overwriting.

A content hash rather than mtime: mtime resolution varies by filesystem, two
saves in one tick can compare equal, and other tools can set it backwards —
exactly the cases this exists to catch.

`PUT` does not create. Once `If-Match` is required there is no coherent token
for a document that does not exist, so creation goes through
`POST /api/files/documents` and nowhere else.

### The write lock

`If-Match` alone has a hole: between hashing the current file and writing the
new bytes, another save can land, the check passes, and the write clobbers it
anyway. Serialising that read-modify-write is what the lock is for.

| Aspect      | Decision                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------- |
| Scope       | Writes only — create, save, upload, move, delete, restore, purge                             |
| Reads       | Never block: tree, document, raw and archive take nothing                                    |
| Granularity | Global; contention is near zero and path-range locking brings deadlock avoidance for no gain |
| On timeout  | `503` with `Retry-After` and `{ code: 'BUSY' }`; the client retries once                     |

**It is in-process only.** Two containers on one volume and it protects
nothing while looking like it does. A single process is the supported
deployment.

Archive streaming deliberately takes no lock: a slow client dragging a large
download over minutes would otherwise block every save. A zip may therefore
catch the tree mid-move.

## Serving files we did not author

`GET /api/files/raw/…` sets the `Content-Type` **from the extension**, never
from what the upload claimed, plus:

```
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'
```

`<img>` already disables scripting, so markdown image syntax is safe by
construction. The CSP closes the direct-navigation hole where an SVG becomes a
scriptable same-origin document. **SVG is never inlined into the DOM.**

Uploads are checked against an extension allowlist and, for rasters, their
magic bytes. The SVG check is structural, not a parse — proving an SVG is
well-formed XML proves nothing about safety, because a hostile SVG is
well-formed. What a signature check can catch is a renamed file.

## API errors

Every error body is `{ error, code }`, and some carry more. The code is what
the UI reacts to; the message is what it shows when it has nothing better.

| Code                    | Status | Also carries                               |
| ----------------------- | ------ | ------------------------------------------ |
| `INVALID_PATH`          | 400    |                                            |
| `BAD_REQUEST`           | 400    |                                            |
| `CONTENT_MISMATCH`      | 400    |                                            |
| `NOT_FOUND`             | 404    |                                            |
| `ALREADY_EXISTS`        | 409    |                                            |
| `INVALID_MOVE`          | 409    |                                            |
| `WOULD_OVERWRITE`       | 409    | `paths`                                    |
| `CONFLICT`              | 412    |                                            |
| `TOO_LARGE`             | 413    | `unit`, `limit`, `measured` for an archive |
| `EMPTY_CONTENT`         | 422    |                                            |
| `PRECONDITION_REQUIRED` | 428    |                                            |
| `BUSY`                  | 503    | `Retry-After` header                       |
| `INTERNAL`              | 500    |                                            |

**Every refusal is logged** through one funnel in `routes/error-response.ts`,
with method, path, status and code. A 4xx is returned rather than thrown, so
`app.onError` never sees it — without that line a rejected upload left no
trace on the server at all.

### Naming anything in the markup

A password manager strips separators from an `id`, `name` or `class` and
substring-matches the result. `file-dialog-input` squashes to
`filedialoginput`, which contains **`login`**, and Bitwarden offered to fill
it. `test/server/field-naming.test.ts` scans the rendered page for credential
words so this cannot come back; it is invisible to anyone reading the markup.

## Limits

| Variable              | Default | Enforced                                       |
| --------------------- | ------- | ---------------------------------------------- |
| `UPLOAD_MAX_BYTES`    | 25 MiB  | `Content-Length` first, then the actual bytes  |
| `ARCHIVE_MAX_BYTES`   | 100 MiB | By walking and measuring **before** any output |
| `ARCHIVE_MAX_ENTRIES` | 2000    | As above                                       |

Measuring the archive first is what lets an oversized request fail with a
status code instead of a truncated download.

## Archive portability

**Downloaded archives carry the names the store holds, unchanged.** No
sanitising, no renaming, no rewriting of document contents. An export is a
faithful copy of the tree or it is not worth having.

Linux accepts filenames that Windows does not: `< > : " | ? *`, the device
names (`CON`, `PRN`, `AUX`, `NUL`, `COM0`–`COM9`, `LPT0`–`LPT9`, with or
without an extension), and a trailing dot. A store holding such a name — one
created before this rule, or by another tool writing into `DOCS_ROOT` — will
produce a zip that Windows Explorer refuses to extract.

**The answer is a better tool.** 7-Zip and similar substitute the offending
characters at extraction time, where the user can see what changed and
override it. Explorer's built-in handler cannot. Point people there.

### Why not munge the names on the way out

This was considered and rejected. Recorded so it is not relitigated:

- **It contradicts zip import.** Importing must _reject_ odd entry names
  rather than sanitise them, because sanitising untrusted archive entries is
  how traversal gets in. Munging on export therefore produces an archive this
  application would refuse to read back.
- **It is not injective.** `a:b.md` and `a?b.md` both become `a-b.md`, so it
  needs collision suffixing, and the mapping stops being derivable from either
  side. Reversing it would need a manifest shipped alongside.
- **Round-tripping duplicates rather than updates.** A munged name reimported
  lands beside the original as a second file. Silent duplication is a worse
  failure than a download that visibly will not extract.
- **Rewriting links to match is out of the question.** It breaks the rule that
  the API never rewrites stored content, and doing it correctly needs a real
  markdown parse that leaves fenced and inline code alone — a path inside a
  code block is being documented, not linked.

If it is ever built anyway: names only, never content, and ship a manifest so
the change is visible. Prefer _reporting_ the non-portable names in the UI so
the user renames them in the store, where the fix is permanent.

**Creating a name Windows cannot take is prevented at the source** — see the
create-time rules in `src/server/storage/safe-path.ts`. That stops the problem
growing without touching names that already exist.

## Logging

**Nothing writes to `stdout` or `stderr` directly.** No `console.*` in shipped
code — `no-console` is on, and there are no suppressions for it.

Server-side errors and diagnostics go through the [`debug`](https://www.npmjs.com/package/debug)
package, via `createLogger` in `src/server/logging.ts`:

```ts
import { createLogger } from '../logging.ts'

const log = createLogger('storage/fs-store', 'write')
log('wrote %s (%d bytes)', id, content.length)
```

Namespaces are `vixen-editor:MODULE[:FUNCTION]`, where MODULE is the module's
path under `src/server/`. That makes `DEBUG` a precise filter:

| `DEBUG` value              | Shows                           |
| -------------------------- | ------------------------------- |
| unset                      | nothing at all — the default    |
| `vixen-editor:*`           | everything, including startup   |
| `vixen-editor:storage/*`   | the document store only         |
| `vixen-editor:app:onError` | unhandled request failures only |

**`DEBUG` has to be re-applied after `.env` loads.** `debug` decides whether a
namespace is on at the moment each logger is created, and every logger here is
created at module-import time — long before `startServer` calls
`loadEnvFile()`. Without a refresh, a `DEBUG` set in `.env` arrives too late and
is silently ignored, while the same value exported in the shell works fine.
`startServer` calls `applyDebugFilter(runtime.env)` immediately after loading
the env file; `debug.enable()` retroactively updates loggers that already exist.
Anything else that mutates `DEBUG` at runtime must do the same.

**The test suite must be completely silent.** `test/server/console-silence.test.ts`
spies on every `console` method and asserts zero calls, and `vitest.config.ts`
forces `DEBUG=''` so silence does not depend on the developer's shell.

This is also why `buildApp` installs its own `app.onError`: Hono's default error
handler calls `console.error(err)` and returns plain text. Ours logs through
`debug` and returns `{ error: 'Internal server error' }` without leaking the
underlying message to the client.

## Layout

**All authored source lives under `src/`.** New source directories go there and
nowhere else.

```
src/
  index.ts        process entry point; guarded one-liner, no wiring
  server/         Hono app, config, filesystem-backed document store
    main.ts       composition root: createApp / startServer
  client/         CodeMirror 6 editor and API client
    main.ts       browser entry point; one line, no wiring
    editor/       decorations, api client, session, bootstrap, highlight
    layout/       three-column shell: toast, explorer, ribbon wiring
  styles/         SCSS; compiled to public/assets/main.css
  templates/      Pug; layout.pug plus _ribbon/_explorer partials
  assets/         binary source assets, copied verbatim to public/assets/
scripts/          build and dev entry points — tooling, not shipped app code
public/           assets/ only — the client bundle and stylesheet, both built
test/             Vitest: server (node), client (happy-dom), conventions (node)
test-browser/     Playwright: real-browser rendering, and the built server
```

### Why `src/` exists

Five separate config files used to enumerate where source lived, and four of the
five failed **silently** when a new root directory was not registered: coverage
`include` (escapes the 100% gate), the conventions `SOURCE_DIRECTORIES` (escapes
rules 2/3/5), the two typecheck projects (tsc just skips the files), and the dev
watch paths (stops rebuilding). Only the root `tsconfig.json` failed loudly.

Consolidating under `src/` collapses three of those into a single glob that picks
up new subdirectories automatically. The residual — a new `src/shared/` matching
neither typecheck project — is caught by a conventions test rather than left to
memory, because `tsc` exits 0 while silently ignoring such a directory.

`scripts/` is deliberately outside `src/`: it is build tooling, never shipped,
and never imported by the app.

## Testing

Tests are written first. Two suites, deliberately separate:

- **`test/`** — Vitest, in three projects: `test/server` (node environment),
  `test/client` (happy-dom) and `test/conventions` (node). This is the coverage
  gate and runs inside the Docker build.
- **`test-browser/`** — Playwright. Needs browser binaries the slim runtime
  image does not carry, so it is excluded from `npm test`. Reserve it for
  assertions that require real layout, geometry or paint, and for driving the
  real built artifacts end to end.

### The conventions suite enforces this document

`test/conventions/project-rules.test.ts` reads the source tree and fails the
gate on:

- a `.ts` or `.js` file that does not open with `'use sanity'` (rule 2)
- a default export outside the three tooling configs (rule 3)
- an `eslint-disable` or `v8 ignore` with no ` -- rationale` (rule 5)
- a file under `src/` matched by neither or both typecheck projects

This exists because a rule that lives only in prose rots. `src/client/main.ts` grew
to ~35 lines of untested logic inside a coverage exclusion while this file
claimed entry points were logic-free, and the "exactly one `v8 ignore`" line
here was stale within a day of being written.

So: **prefer enforcing a rule over restating it, and do not write counts into
this file.** A number here is a promise to come back and re-sync, which nobody
does. The scanner skips its own source, since it would otherwise match the
patterns it searches for; everything else is checked.

### Coverage is 100%, with a short exclusion list

All four v8 metrics are held at 100%. A partial gate leaves the uncovered
remainder unidentified, and the hardest-to-test code is usually the riskiest.

**One exclusion, and no others: `src/client/main.ts`.**

Entry points are the awkward case, because a module that starts a server or
mounts an editor at import time cannot be imported by a test. The wiring in them
is real — static mount paths, which config field reaches which consumer, the
order `.env` loads in — and all of it used to sit outside the gate. A whole-file
exclusion is a standing invitation, and `src/client/main.ts` accepted it once
already: it grew to ~35 lines of status handling, query parsing and error
formatting that nothing verified.

The resolution is a composition root plus a guard:

- **All wiring lives in a tested module** — `src/server/main.ts` (`createApp`,
  `startServer`) and `src/client/editor/bootstrap.ts` (`bootstrap`). Effects are
  injected: `startServer` takes a `Runtime` carrying `serve`, `loadEnvFile`,
  `env` and `publicDir`, so a test asserts what `serve` was handed without
  binding a socket. `bootstrap` takes `root`, `search` and `session`, so a test
  drives it against a detached DOM.
- **`src/index.ts` is inside the gate.** It is three lines guarded by
  `import.meta.main`, which is false under the runner, so a test can import it
  inertly. Node 26 honours it and esbuild preserves it through bundling. One
  `v8 ignore` covers the guarded call. Add logic here and coverage will demand a
  test for it.
- **`src/client/main.ts` stays excluded**, at one line. A browser bundle has no
  `import.meta.main`, and the only way to make it inertly importable would be a
  guard that changes behaviour — silently doing nothing when `#editor` is absent
  instead of reporting it. That is a coverage trick, not a design improvement,
  so the honest answer is a one-line exclusion plus real end-to-end coverage.

Both entry points are additionally executed for real by `test-browser/`:
Playwright's `webServer` boots `node dist/index.js`, and `server.spec.ts`
asserts against that live process rather than leaving its startup an
unstated precondition.

Prefer making a branch testable over suppressing it. Extracting a pure helper
beats a `v8 ignore`; a coverage gate must not depend on who is running it, so do
not reach for tricks that only work as a non-root user. Suppressions should stay
rare, and every one must carry a rationale — `test/conventions/` fails the gate
if any does not.

## Toolchain notes

- **TypeScript 6.0.3, not 7.** TS 7.0 ships no programmatic compiler API, and
  `@typescript-eslint/typescript-estree` declares `typescript: ">=4.8.4 <6.1.0"`.
  Installing TS 7 breaks type-aware linting outright. Revisit when 7.1 ships the
  API _and_ a typescript-eslint release supports it.
- **Imports carry the `.ts` extension.** Node's type stripping and esbuild both
  resolve the real on-disk path, which is why `allowImportingTsExtensions` is on.
- **Icons are a self-hosted Material Symbols font**, `src/assets/` copied to
  `public/assets/` by `buildAssets()`. It ships **unsubsetted (316 KB) on
  purpose**: a subset is 1.6 KB but must be regenerated whenever an icon is
  added, and forgetting renders a blank glyph with no error. Do not "optimise"
  it into that footgun. `test-browser/layout.spec.ts` asserts the font actually
  loads, because a broken `@font-face` path renders the literal ligature text
  (`library_books`) instead of a glyph.
- **`public/` is entirely generated.** Source assets belong in `src/assets/`;
  anything written directly into `public/assets/` is lost on the next build and
  cannot be committed, since that directory is gitignored.
- **Markup is Pug**, in `src/templates/`, rendered by the server at request time
  through `createTemplateRenderer` in `src/server/templates.ts`. Templates are
  compiled on demand and **cached only in production**, so an edit shows up on
  the next request without a restart. The directory is `TEMPLATES_DIR`; the
  Docker image copies the templates to `./templates` and sets it, so the code
  never carries two defaults. Rendering at request time is deliberate — it is
  what will let a future SPA merge these same templates with data on the client
  rather than round-tripping for markup.
- **Styles are SCSS**, authored in `src/styles/` and compiled by `sass` to
  `public/assets/main.css` in `scripts/build.ts`. The theme is Bootswatch
  Darkly; `_tokens.scss` keeps the upstream variable names so it can be diffed
  against the original. The `cm-vixen-*` decoration class names are produced by
  `src/client/editor/decorations.ts` and asserted by tests — restyle them, do
  not rename them.
- **Syntax colours are not CSS.** CodeMirror's `basicSetup` bundles
  `defaultHighlightStyle`, which is built for light backgrounds and renders
  markdown markers like `#` near-black — invisible on a dark surface, and not
  reliably overridable from a stylesheet because the generated class names
  (`ͼ5`) are unstable. `src/client/editor/highlight.ts` supplies a
  `HighlightStyle` on the Darkly ramp instead. Theme changes touching token
  colours belong there, not in SCSS.
- **The server is bundled, not just the client.** esbuild inlines every
  dependency so the runtime Docker stage ships `dist/`, `public/` and
  `templates/` with no `node_modules`. Adding a native dependency breaks this
  and it must then move to `external`. `pug` was checked against this: it
  bundles cleanly and renders with no `node_modules` present, because nothing
  here uses `:filter` syntax — that is the only path reaching `jstransformer`'s
  dynamic `require`.
- **`eslint-config-love` is strict by design** and expects local relaxation.
  Three rules are relaxed project-wide, each justified in `eslint.config.js`.
  Prefer fixing the code over adding a fourth.
