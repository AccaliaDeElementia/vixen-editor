# vixen-editor — design

<a id="design-25e739"></a>

## Response headers

**Every response carries `X-Clacks-Overhead: GNU Terry Pratchett`** — success,
error, static asset, 404, all of it. The constants live in
`src/server/clacks.ts` and are exported so tests assert the same strings the
implementation uses.

**It is written on the Node response, not through Hono's context.** The Fetch
`Headers` class lowercases every name it stores, so `c.header(…)` puts
`x-clacks-overhead` on the wire — still correct HTTP, because field names are
case-insensitive, but the spelling is the entire point of the tradition.
`ServerResponse.setHeader` keeps the case it is given, and `@hono/node-server`
leaves such a name alone unless the `Response` it is applying carries one that
matches it.

The two mechanisms are therefore exclusive rather than complementary: set both
and the lowercase `Headers` copy lands on top, which is what shipped here for
the life of the project.

`withClacks` wraps the fetch handler `startServer` hands to `serve`, so the
name is on the socket's response before Hono dispatches. Nothing a route does
can miss it, and that retires a middleware-ordering hazard that used to need a
table of its own — `HTTPException.getResponse()` builds a fresh `Response`, so
a header buffered in the one before it never arrived.

`test/server/clacks.test.ts` drives the real app through the wrapper for every
status it can answer with, asserting the recorded `setHeader` call: a `fetch`
`Headers` object lowercases on read as well as write, so no unit test that
reads a `Response` can see this defect at all. `test-browser/server.spec.ts`
closes that with Playwright's `headersArray()`, which is the one client here
that reports a name as it arrived.

Under HTTP/2 the case is lost whatever we do, since HPACK requires lowercase
field names. That costs nothing while `serve` is given no HTTP/2 options.

<a id="design-e97042"></a>

## UI state

Explorer width and open/closed state persist in **`localStorage`** under
`vixen-editor:explorer`, via `src/client/preferences.ts`.

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

<a id="design-e6bdab"></a>

## Keyboard

**Every key the app binds is named in `src/client/help.ts`.** `KEYS` holds the
literals and the help entries beside it carry the same values, so a shortcut
that is missing from the cheatsheet cannot be bound at all — which is the point,
because a help list that is quietly incomplete is read as authoritative.

Two tests hold it, and they check different halves.
`test/conventions/keyboard-registry.test.ts` fails on a key literal, or on a
constant that did not come from `help.ts`, at any binding site under
`src/client/`. `test/client/help.test.ts` checks that `KEYS` and the help
entries name the same set **in both directions**, so neither an unlisted
binding nor an invented entry survives.

**Gestures are not enforced, and that is the known gap.** Nothing in the code
marks "double-click opens a row", so the gesture half of the list is
hand-written and can fall behind. Add the entry by hand when adding a gesture.

<a id="design-4856aa"></a>

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

<a id="design-3b0e71"></a>

### The URL names the active tab, and switching tabs replaces it

**`?view=` names which view of the document is in front**, taking `edit`,
`source` or `preview`, and defaulting to `edit` when absent. A tab is keyed by
_(path, view)_, so without it the URL could not name the active tab at all —
open a source preview, reload, and you would land silently on the editor, and a
preview could never be shared. It is **ignored entirely for a location that
renders no editor**: a trash entry and an image have no view to choose, which
falls out of `openPath` returning early for both before the view is read.

The URL names the active tab and **nothing else** — not the tab set, not the
split. A shared link opens that one document in a fresh single-tab workspace;
the rest is this browser's state.

**Activating a tab replaces the address rather than pushing one.** If every tab
switch pushed an entry, Back would become an undo for tab switching, which no
tabbed editor does and which fights the ribbon's own Back and Forward. The
consequence is worth stating because it surprises: open A, click B, press Back,
and you return to **A in the same tab set**, rather than B closing.

The two spellings are deliberate — the URL says `preview` where the code says
`markup` — and `src/client/doc-path.ts` holds the single table both directions
read, so a reader-facing word cannot drift from the internal one.

<a id="design-97a8a7"></a>

### The editor follows a document that moves

The file tree and the editor are mounted independently by `client/main.ts` and
never see each other, so a move reaches the editor as an event on the shared
root — `DOCUMENT_MOVED` in `src/client/document-moved.ts`, which owns the
name and the shape so the two sides cannot disagree about either.

On hearing one the editor re-reads its own identity through `pathAfterMove` —
a folder move carries the open document without ever naming it — then calls
`session.rename` to carry the etag across, and **replaces** the address rather
than pushing one, because the document moved, it did not navigate.

**A repaired document is reported, not reloaded.** If the move rewrote links
inside the open document, its bytes on disk are newer than the buffer, so the
editor says so and leaves the buffer alone. Replacing it would discard unsaved
edits, and the carried-over etag makes a save answer `412` rather than
clobber — the warning is what explains that answer.

<a id="design-9ca2c0"></a>

## The document store

<a id="design-1fec07"></a>

### `.md` and `.txt` are the same thing

One document family, in two coats. Anything that accepts one accepts the
other, including the listing. A format that the listing shows but the reader
refuses is the fault described below.

<a id="design-67c78d"></a>

### What a name may be

`isAllowedName` in `src/server/storage/safe-path.ts` is the **single** answer
to "may this name exist here", used both by the path validator and by the
walks that decide what to list. Two answers is what let a file be listed and
then refused when opened — a real defect, hit by a document with a space in
its name.

Rejected in a path segment. The left column is the message the validator
gives back, verbatim — `test/conventions/` fails the gate if this table and
`NAME_RULES` disagree, which is how a prose copy of a code-owned rule silently
went false once before.

| Refused because it…                                  | Why that matters                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `must not contain an empty path segment`             | `a//b` is two names with nothing between them                       |
| `must not contain a relative path segment`           | Traversal                                                           |
| `must not contain a segment beginning with a dot`    | Hidden files, and it is how `.trash` stays unreachable              |
| `must not contain a backslash`                       | A separator that breaks the moment an export is unzipped on Windows |
| `must not contain a control character`               | Corrupts logs and terminal output                                   |
| `must not contain an invisible formatting character` | Bidi overrides and zero-width characters; the spoofing class        |
| `may only use a zero-width joiner between emoji`     | Joining emoji is the only thing a joiner is for                     |
| `must not be only whitespace`                        | A name nobody can see or type                                       |
| `must not begin or end with whitespace`              | `notes.md` and `notes .md` are indistinguishable in a tree          |
| `must be at most 255 bytes`                          | `NAME_MAX` counts bytes: 64 emoji is 256                            |

`/` never reaches these rules — a path is split on it first, so a segment
cannot contain one.

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

<a id="design-eae374"></a>

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

Rewriting with an identity function must return the document byte-identical:
a destination is spliced only when its resolved target changed, so the written
form is preserved exactly as authored.

`POST /api/files/moves` answers `200 { rewritten, failed }`, naming documents
at their paths _after_ the move, so a client can tell an open editor that its
content moved underneath it.

**Link repair is per document and never fails the move.** A document that
cannot be read or written goes in `failed` and the pass carries on, left
byte-identical.

**Documents are enumerated before the move, not after.** A document is
relinked against the path it held when its links were written, and after the
move that path is gone. The mapping also cannot be inverted: a merge leaves
the destination holding both moved and pre-existing files with nothing to tell
them apart.

<a id="design-0d781c"></a>

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

So a `.vixen-*.tmp` outlives its write in exactly two cases: a killed process,
and a cleanup that could not delete it.

**`sweepTemporaries` collects those orphans, and only at startup.** A crashed
instance is not around to tidy up after itself, and deleting a temporary is
safe only while nothing is mid-write — which stops being true the moment the
server accepts a request. So `startServer` awaits the sweep _before_ calling
`serve`, and that ordering has its own test. At any other moment the sweep
would need an age heuristic, and a wrong guess deletes a temporary out from
under a live write.

A sweep that fails is logged and forgotten: housekeeping must not stop the
editor serving, which is why `startServer` is `async`.

<a id="design-695494"></a>

### Deleting goes to the trash

`.trash/<uuid>/` holds `meta.json` and a payload under the fixed name
`payload`. Fixed, because a folder may legitimately be called `meta.json` and
would otherwise collide with the metadata beside it.

Entry ids are UUIDs, which is what keeps a caller-supplied id out of the
filesystem path. Deleting the same path twice yields two entries. A damaged
entry is skipped by the listing rather than breaking it.

There is **one** delete. `DELETE /api/documents/:id` was removed so that
existence is managed in one place.

**Emptying the trash works on the directory, not on the listing.** Because the
listing skips a damaged entry, purging what it shows would leave that entry
there for good, with nothing in the interface able to reach it. `DELETE
/api/trash` therefore removes every child of `.trash` and answers with how many
went, which is why the count it reports can exceed the count the Trash row
shows.

<a id="design-6025c7"></a>

### Moving

**A move puts an entry where nothing is.** An occupied destination is
`ALREADY_EXISTS`, and the user deletes or renames what is in the way. That is
one `rename`, so a move is atomic and costs nothing in bytes however large the
subtree.

Merging two folders and replacing an occupied path are deliberately **not**
supported. Neither was ever asked for: both fell out of checking collisions
per file and recursively, and that check is where every hard case in this document
came from — two tree walks, a trash pass over the losers, and an invariant
about mergeable directories that only a comment held. A confirmation that
trashes a subtree also has a blast radius the dialog cannot usefully show.

Both are additive to bring back after the MVP, and a behaviour change to
remove once anyone relies on them, which is why they go now rather than
later.

A rename may not change what a file claims to be — not across kinds
(`notes.md` to `notes.svg`) and not between image formats (`photo.png` to
`photo.jpg`), because the raw route types a response from the extension alone.
Within one kind the test is the media type that route would serve, so document
extensions stay interchangeable and image formats do not.

**A move reads every document in the store**, because a link from anywhere can
point at the thing that moved, and it does so inside the write lock along with
the move itself. So the lock hold time scales with the store rather than with
the move, which is the one thing about this design worth knowing before the
store gets large. Parsing dominates, which is why a document
holding no link syntax at all is skipped without being parsed — see
`mayHoldLinks` in `storage/relink-store.ts`, whose soundness is pinned by a
test computing the same answer unfiltered. A store large or link-dense enough
to reach the timeout has `WRITE_LOCK_TIMEOUT_MS` to pull.

Reading outside the lock and taking it only to write was measured and
rejected: it roughly halves the hold time without changing the shape of the
curve, and it reopens the exact read-modify-write window the lock exists to
close.

<a id="design-e1ba9e"></a>

## Concurrency

<a id="design-4c2a9a"></a>

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

**`GET` honours `If-None-Match`**, answering `304` with the token and no body
when it still matches, and the new content with the new token when it does
not. That is deliberately the same request as a read: the client's periodic
freshness check needs the content whenever the answer is "changed", so a
separate "has it changed" endpoint would cost a second round trip for the
case that matters. Weak tokens, comma-separated lists and `*` are all honoured,
because that is what the header specifies.

**The check costs a file read.** The ETag is a content hash, so there is no
way to learn it without reading the file — `304` saves bandwidth, not disk.
Trivial for a self-hosted editor, and worth knowing before anyone polls every
second.

<a id="design-8db842"></a>

### The write lock

`If-Match` alone has a hole: between hashing the current file and writing the
new bytes, another save can land, the check passes, and the write clobbers it
anyway. Serialising that read-modify-write is what the lock is for.

| Aspect      | Decision                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope       | Writes only — create, save, upload, move, delete, restore, purge                                                                              |
| Reads       | Never block: tree, document, raw and archive take nothing                                                                                     |
| Granularity | Global; contention is near zero and path-range locking brings deadlock avoidance for no gain                                                  |
| On timeout  | `503` with `Retry-After` and `{ code: 'BUSY' }`; the client retries once                                                                      |
| Timeout     | `WRITE_LOCK_TIMEOUT_MS`, default 5000, clamped to 250–60000; the default lives in `storage/lock.ts`, which both the config and the store read |

**It is in-process only.** Two containers on one volume and it protects
nothing while looking like it does. A single process is the supported
deployment.

**The timeout is how long a waiter queues, not how long the lock is held.**
Below it nothing becomes unsafe — writes still serialise and `If-Match` still
holds — but a waiter that gives up too fast turns ordinary concurrency into
`503 BUSY`. Why the bounds sit where they do is recorded on the constants in
`config.ts`.

Archive streaming deliberately takes no lock: a slow client dragging a large
download over minutes would otherwise block every save. A zip may therefore
catch the tree mid-move, **or fail part-way when a file it had planned to
include is deleted first** — the download is the blast radius, and a client
has to be ready for a transfer that begins with `200` and does not finish.

**Because reads take no lock, a listing can race a delete, and the walk
tolerates it.** Two tabs are enough: delete a folder in one while the other
lists the tree. `walkDirectory` treats a subdirectory that vanished the same
way `readTree` treats an absent root — the entry is omitted, because a tree is
a snapshot and something removed while it was being taken is legitimately
absent from it. Reporting it as an _empty_ folder would list something that is
not there, and letting the `ENOENT` escape turned an ordinary delete in
another tab into a `500`. `planArchive` walks the same tree and inherits this.

The move code reads directories without that tolerance on purpose: it runs
inside the write lock, so a directory disappearing under it means something
outside the application is writing to `DOCS_ROOT`, which is an error rather
than a race.

<a id="design-9477d0"></a>

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

**A rejection says what the bytes actually are.** `CONTENT_MISMATCH` carries
`detected` — the extension the signatures recognised, or `null` for something
that is not an image at all — so the client can offer the corrected name rather
than only reporting a refusal. `detectedFormat` and `contentMatchesExtension`
read the same ordered signature list, because a rejection that suggested a name
the next upload would refuse is worse than no suggestion.

**Upload takes an optional `filename`.** Absent, the stored name comes from the
`File`, as before. It adds no attack surface — `file.name` was already
caller-controlled and already travelled this path, so naming the field changes
who spells it, not what is validated. It exists so that storing under a chosen
name is one request: upload-then-move is two writes that can half-fail, leaving
a stray file under the wrong name.

<a id="design-e8c160"></a>

## API errors

Every error body is `{ error, code }`, and some carry more. The code is what
the UI reacts to; the message is what it shows when it has nothing better.

| Code                    | Status | Also carries                                  |
| ----------------------- | ------ | --------------------------------------------- |
| `INVALID_PATH`          | 400    |                                               |
| `BAD_REQUEST`           | 400    |                                               |
| `CONTENT_MISMATCH`      | 400    | `detected`, the format the bytes actually are |
| `NOT_FOUND`             | 404    |                                               |
| `ALREADY_EXISTS`        | 409    |                                               |
| `INVALID_MOVE`          | 409    |                                               |
| `CONFLICT`              | 412    |                                               |
| `TOO_LARGE`             | 413    | `unit`, `limit`, `measured` for an archive    |
| `EMPTY_CONTENT`         | 422    |                                               |
| `PRECONDITION_REQUIRED` | 428    |                                               |
| `BUSY`                  | 503    | `Retry-After` header                          |
| `INTERNAL`              | 500    |                                               |

**Every refusal is logged** through one funnel in `routes/error-response.ts`,
with method, path, status and code. A 4xx is returned rather than thrown, so
`app.onError` never sees it — without that line a rejected upload left no
trace on the server at all.

<a id="design-cc083f"></a>

### Naming anything in the markup

A password manager strips separators from an `id`, `name` or `class` and
substring-matches the result. `file-dialog-input` squashes to
`filedialoginput`, which contains **`login`**, and Bitwarden offered to fill
it. `test/conventions/field-naming.test.ts` scans the rendered page for credential
words so this cannot come back; it is invisible to anyone reading the markup.

<a id="design-7a41d2"></a>

### A pane's markup is hooked by `data-part`, never by an id

The workspace views — the editor mount, the tab strip, the footing, and the
image, pending, missing, deleted and unreachable sections — live inside a pane,
and `src/templates/_pane.pug` renders a pane through a mixin so there can be
more than one. Everything a client module looks up inside a pane is marked with
`data-part`, and the lookup is made against **that pane's element** rather than
against the document.

**An id cannot do this job**, which is the whole reason for the attribute: two
panes would carry two elements with the same id, so `document.querySelector`
would answer with whichever came first and the second pane would quietly drive
the first one's markup. Nothing would throw, and the only symptom would be a
view appearing in the wrong half of the screen.

The one id that stays is `id="editor"` on the **primary** pane, because the skip
link is a document-level anchor and `href="#editor"` needs one. The mixin takes
that as a parameter rather than emitting it always, so a second pane does not
repeat it. No client module reads it.

`.pane` carries the flex column the workspace used to supply directly. Moving
the views inside a wrapper without moving that layout left the editor with no
height, so nothing scrolled and CodeMirror never parsed past its first chunk —
caught by `test-browser/rendering.spec.ts`, not by any unit test.

<a id="design-68c8d3"></a>

## Limits

| Variable                | Default | Enforced                                            |
| ----------------------- | ------- | --------------------------------------------------- |
| `UPLOAD_MAX_BYTES`      | 25 MiB  | `Content-Length` first, then the actual bytes       |
| `ARCHIVE_MAX_BYTES`     | 100 MiB | By walking and measuring **before** any output      |
| `ARCHIVE_MAX_ENTRIES`   | 2000    | As above                                            |
| `WRITE_LOCK_TIMEOUT_MS` | 5000    | How long a write waits before `503 BUSY`; 250–60000 |

Measuring the archive first is what lets an oversized request fail with a
status code instead of a truncated download.

<a id="design-428132"></a>

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

<a id="design-2fcd7d"></a>

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

<a id="design-72c03f"></a>

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

**The test suite must be completely silent.** `test/conventions/console-silence.test.ts`
spies on every `console` method and asserts zero calls, and `vitest.config.ts`
forces `DEBUG=''` so silence does not depend on the developer's shell.

This is also why `buildApp` installs its own `app.onError`: Hono's default error
handler calls `console.error(err)` and returns plain text. Ours logs through
`debug` and returns `{ error: 'Internal server error' }` without leaking the
underlying message to the client.

<a id="design-1ab8b5"></a>

## Layout

**All authored source lives under `src/`.** New source directories go there and
nowhere else.

```
src/
  server/         Hono app, config, filesystem-backed document store
    index.ts      process entry point; guarded one-liner, no wiring
    main.ts       composition root: createApp / startServer
  client/         CodeMirror 6 editor and API client
    main.ts       browser entry point; one line, no wiring
    editor/       decorations, api client, session, bootstrap, highlight
    layout/       three-column shell: toast, explorer, ribbon wiring
  styles/         SCSS; compiled to public/assets/main.css
  templates/      Pug; layout.pug plus _ribbon/_explorer partials
  assets/         binary source assets, copied verbatim to public/assets/
scripts/          build and dev entry points — the shipped artifact depends on these
tools/            instruments nothing depends on: the assertion scan, the mutation harness
public/           assets/ only — the client bundle and stylesheet, both built
test/             Vitest: server (node), client (happy-dom), conventions (node)
test-browser/     Playwright: real-browser rendering, and the built server
```

<a id="design-ff42b8"></a>

### Why `src/` exists

Five separate config files used to enumerate where source lived, and four of the
five failed **silently** when a new root directory was not registered: coverage
`include` (escapes the 100% gate), the conventions `SOURCE_DIRECTORIES` (escapes
[rules 2/3/5](CLAUDE.md#claude-424991)), the two typecheck projects (tsc just skips the
files), and the dev
watch paths (stops rebuilding). Only the root `tsconfig.json` failed loudly.

Consolidating under `src/` collapses three of those into a single glob that picks
up new subdirectories automatically. The residual — a new `src/shared/` matching
neither typecheck project — is caught by a conventions test rather than left to
memory, because `tsc` exits 0 while silently ignoring such a directory.

`scripts/` and `tools/` are deliberately outside `src/`: neither is shipped and
neither is imported by the app. They are split by **what depends on the
output**, not by who runs them. `scripts/build.ts` produces `dist/` and
`public/`, which the Docker image copies out, so the running application
depends on it; `scripts/dev.ts` imports it. `tools/assertions.ts` and
`tools/mutate.ts` are instruments — nothing depends on them, and what they
produce is a judgement a person reads.

**That split does not license a directory-level coverage rule.** `tools/` holds
`assertions.ts`, which is pure string analysis and cheap to test, beside
`mutate.ts`, which spawns a suite run per mutant and rewrites the working
tree — so a single rule over the pair would ask for the stubbing this codebase
has already measured and rejected. Checks go per file, proportionate to how
silently each can be wrong.

<a id="design-d7fa84"></a>

### What each directory under `src/` means

The axis differs between the two sides, deliberately rather than by neglect.
`src/shared/` has its own section below.

| Directory          | Is                    | Holds                                        |
| ------------------ | --------------------- | -------------------------------------------- |
| `server/routes/`   | a layer               | HTTP in, store calls out                     |
| `server/storage/`  | a layer               | everything that touches the filesystem       |
| `server/markdown/` | a subject             | pure text manipulation, no IO                |
| `client/editor/`   | an area of the screen | the CodeMirror surface and what drives it    |
| `client/layout/`   | an area of the screen | the shell: explorer, views, status bar       |
| `client/files/`    | a feature             | the file browser, and the client for its API |

Forcing one axis across both sides was weighed and refused: it is a large
refactor for a legibility gain nobody could demonstrate, and `markdown/` is a
subject rather than a layer because it is _pure_, which is the fact worth
knowing about it.

**Each side's root holds two kinds of module**, which is what makes it look
inconsistent at a glance. `server/index.ts`, `server/main.ts`, `server/app.ts`
and `client/main.ts` are composition — they reach down into the areas.
Everything else at a root is vocabulary or a service the areas share:
`doc-path`, `help`, `toast`, `error-message`, `config`, `logging`,
`node-errors`.

**So a new file goes into the area that uses it.** When two areas on the same
side both need it and neither sits below the other, it belongs at that side's
root — that is what the root is for, and leaving it inside one area is what
breaks the order described next.

<a id="design-535790"></a>

### Sibling areas are read in one order

The areas on each side form a DAG, and `test/conventions/` fails the gate on a
pair that imports each other at runtime:

```
client:  editor → layout → files
server:  routes → storage → markdown
```

That is the order to read them in, and the reason the check exists. A cycle
means there is no such order, so a newcomer has to hold a whole side in mind at
once rather than one directory at a time. `toast` and `preferences` sat in
`layout/` while `files/` imported them, which is precisely how the client lost
its order — and nothing said so until the graph was measured.

**The check covers sibling areas, not every directory.** Each side's root both
reaches down into the areas and is reached up to by them, so root-against-area
is mutual by construction and says nothing about whether the tree is readable.
Treating that as a cycle would mean splitting composition from shared
vocabulary on both sides, which buys nothing.

**A type-only import is excluded, because the compiler erases it.** It creates
no load order and cannot produce a runtime cycle. `layout/status-bar.ts` reaches
into `editor/autosave.ts` for `SaveState`, and there is no cheap home for that
type: the autosave machine owns the vocabulary, the status bar renders it, and
[rule 2](CLAUDE.md#claude-424991) forbids a module that declares nothing but a type. **Prefer to avoid a
type-only backlink where extracting the type or the common code is cheap and
logical. Do not forbid one.**

<a id="design-17dbc3"></a>

### `src/shared/` is what both sides need

Three directories under `src/`, and the boundary between them is enforced:
`server/` and `client/` may not import each other, and `shared/` may not
import either. A module lands in `shared/` only when **both** sides import
it — the rule is per module, not per export, because a module is one
vocabulary and a predicate belongs beside the type it guards even in a week
when only one side calls it.

**A shared module holds one meaning, and that is load-bearing rather than
tidy.** The both-sides rule is checked per module, so a module containing two
unrelated things — a guard the client uses and a constant the server uses —
would satisfy it while sharing nothing. `test/conventions/` closes that by
also requiring the two sides' import sets to **overlap**: at least one export
must be imported by both. That permits a predicate only one side calls today,
because the type beside it is imported by both, and refuses a module whose
halves have separate audiences.

Cohesion is what makes the check meaningful, so merge modules only when they
mean the same thing. Similar code is not common meaning: two functions with
identical bodies can belong to different vocabularies, and putting them
together buys a line and loses the property that makes `shared/` legible.

**Portability is checked by the compiler, not by convention.** `src/shared/**`
is listed in _both_ typecheck projects, so it compiles once with
`types: ["node"]` and again with `types: []` and DOM libs. Shared code
therefore cannot reach for `node:fs` or `document`; the attempt fails a build
rather than a review. This is the one place a `src/` file belongs to two
projects, and `test/conventions/` allows it there and nowhere else.

**Shared code is paid for twice.** It is bundled into `dist/` and into the
browser bundle, so weight lands on the client whether the client needs it or
not. A two-member enum costs 103 bytes as a `const` array with a derived
type, and 453 KB as a `z.enum` — zod does not tree-shake to a schema. Zod
stays on the server, where it is already loaded and where nothing is shipped
over the wire.

What belongs here: a fact both sides must agree on — the document kinds, the
`/doc/` prefix, the folder index name — and small pure helpers both already
duplicate. What does not: anything naming an HTTP standard, anything either
side could define alone, and anything whose shape differs across the
boundary. The tree JSON is the example — the client deliberately narrows the
server's entry, dropping `size` and `modified` it never renders, and forcing
one type on both would make one of them lie.

<a id="design-79c76a"></a>

## Browser support

**The floor is Chrome 119, Firefox 147, Safari 26.2.** It is measured rather
than assumed — `@mdn/browser-compat-data` is the source — and each column is
anchored to the feature that sets it, so the number can be re-derived instead
of remembered:

| Feature                         | Sets                                   | Shipped             |
| ------------------------------- | -------------------------------------- | ------------------- |
| Navigation API                  | Chrome 105, Firefox 147, Safari 26.2   | Dec 2025 – Jan 2026 |
| `Promise.withResolvers`         | Chrome 119                             | Oct 2023            |
| `fetch(…, { keepalive: true })` | superseded by the Navigation API floor | Nov 2024            |

The ES2024 target and its RegExp `v` flag ask only for Chrome 112 / Firefox 116
/ Safari 17, so the language level is no longer what binds.

**The Navigation API is the expensive one, and it was chosen deliberately.**
`popstate` is not cancellable — the URL has already changed by the time it
fires — so "save before leaving" on Back cannot be honoured with it at all,
and `navigation.canGoBack` is the only way to keep the ribbon's Back and
Forward buttons truthful rather than plausible. No fallback provides either.

**A hard floor breaks a feature; a soft one degrades it, and they are worth
telling apart.** `Promise.withResolvers` is hard: below it, opening any file
dialog throws. `keepalive` is soft: Firefox below 133 ignores the flag, so the
unload save is quietly dropped and the `beforeunload` prompt is all that
protects the buffer. Say which kind you are adding.

**Before MVP there are no users, so raising the floor is the cheap lever.**
Reach for it _before_ contorting code to fit the current one. A deprecated API
kept alive for a browser window that closed years ago costs suppressions,
comments and review attention for as long as the code lives, and buys nobody
anything — `beforeunload`'s `returnValue` was exactly that trade, and it was
refused.

**Announce it when you reach for it.** Raising the floor is a product decision
wearing a technical hat, so it is surfaced in the reply that makes it, the way
a new comment or suppression is: name the feature, the versions, and what
breaks below them. The human pushes back if it is too aggressive.

That last rule exists because this has already slipped through twice.
`Promise.withResolvers` moved Chrome from 112 to 119 in a commit about
suppressions, and `keepalive` moved Firefox from 121 to 133 in the next one.
Neither was noticed until the floor was being written down, and neither was a
decision anyone made on purpose.

<a id="design-15c5ed"></a>

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
  it into that footgun. `test-browser/shell.spec.ts` asserts the font actually
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
- **Code blocks are highlighted from grammars already in the bundle**, with the
  fence's info string respected rather than the language guessed. The named set
  is `c`, `cpp`, `css`, `diff`, `dockerfile`, `go`, `html`, `java`,
  `javascript`, `json`, `jsx`, `lisp`, `markdown`, `python`, `ruby`, `rust`,
  `shell`, `sql`, `toml`, `tsx`, `typescript`, `yaml` — one bundle rather than
  lazy loading, because the server serves a single file and code splitting would
  change that. An unknown info string renders as plain text, never as an error.
  `src/client/highlight-code.ts` owns the set, and `test/conventions/` fails the
  gate when it and this list disagree.
- **The server is bundled, not just the client.** esbuild inlines every
  dependency so the runtime Docker stage ships `dist/`, `public/` and
  `templates/` with no `node_modules`. Adding a native dependency breaks this
  and it must then move to `external`. `pug` was checked against this: it
  bundles cleanly and renders with no `node_modules` present, because nothing
  here uses `:filter` syntax — that is the only path reaching `jstransformer`'s
  dynamic `require`.
- **`eslint-config-love` is strict by design** and expects local relaxation.
  **Shipped code switches nothing off**: every rule turned off in
  `eslint.config.js` is scoped to `test/**`, `test-browser/**` or a config
  file. `test/conventions/` fails the gate on **any** scoped rule override that
  is not on its approved list — not only one set to `off`, because a rule
  weakened through its options is the same hole wearing a different hat, and
  two had already landed that way. A scoped override covers code nobody has
  written yet, so unlike a suppression at a line it never comes back into
  review — prefer fixing the code, then an inline suppression with a rationale,
  and treat a new override as the last resort.
- **Specs get `max-lines` 1000; shipped code keeps love's 450.** A spec's
  length tracks how many behaviours its subject has rather than how many
  responsibilities the file has, so the lower limit was landing on files doing
  exactly one thing and being paid in artificial edits. The rationale and the
  measurement are on `MAX_SPEC_LINES` in `eslint.config.js`.
