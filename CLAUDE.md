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
