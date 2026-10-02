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

#### One form per purpose

**A tooling suppression uses `/* */`.** Always, including a one-line one, so
the rationale it must carry has somewhere to go.

**Everything else uses `//`.** Always. A non-suppression `/* */` block is a
mistake, not a matter of taste.

This is not formatting. A block comment is _the shape of a suppression
rationale_, and a suppression rationale is the one comment this rule waves
through on sight. Prose wearing that shape reads as already-justified and
stops being read as prose at all — which is how a batch of them accumulated
here across two commits, each one looking like something that had already
passed review.

Keeping the forms apart makes the two kinds distinguishable at a glance, and
makes "is this justified?" a question that gets asked again.

#### A firing rule is a defect report about the code

A suppression is the one comment this file waves through on sight, which is
exactly what makes it the one most worth resisting. Before writing one, treat
the rule as having found something real, and look **wider than the line it
points at** — the line is where the rule noticed, rarely where the problem is.

1. **Ask what the rule objects to in the code's own terms.** A rule name is a
   symptom, not a diagnosis.
2. **Look for the same rule firing elsewhere.** Several sites sharing a
   rationale are one missing abstraction wearing several hats, and the
   rationale being copyable is the tell.
3. **Try the restructuring.** Extract the helper, name the intermediate, split
   the function, change the return type, replace the loop. Suppressions
   removed this way here have twice turned out to be sitting on top of live
   bugs that the suppression was hiding.
4. **Only then suppress**, when no practical restructuring avoids it, and say
   in the rationale what was tried and why it did not work.

A suppression that survives this is usually one where the rule asks for the
opposite of the requirement — serialising where it wants concurrency, say.
Saying so is what marks it permanent rather than pending.

#### A rationale expires, and nothing announces it

The gate re-checks the code around a suppression forever, and never re-checks
the claim that justified it. Some claims cannot expire: `NAME_MAX` is 255
whatever happens next. The dangerous shape is **"nothing available can express
this"**, because that is a statement about the toolchain rather than about the
code, and the toolchain moves underneath it in silence.

Both `promise/avoid-new` suppressions in `src/` said exactly that, about a
dialog's close event and about a mutex waiter, and both were true when
written. The ES2024 bump shipped `Promise.withResolvers` — precisely the
deferred they were hand-rolling — and neither was revisited until a rule about
suppressions was being written months later.

So these changes carry an obligation to re-read the suppressions they could
reach, **in the same commit that makes them**:

| The change                                   | What it can retire                                  |
| -------------------------------------------- | --------------------------------------------------- |
| a language or runtime target bump            | "no existing construct can express this"            |
| a dependency or lint-config update           | a rule that changed shape, or stopped firing at all |
| restructuring the code a suppression sits in | the condition the rule was objecting to             |
| deleting code                                | a relaxation or suppression that now covers nothing |

**Checking is cheaper than reasoning about it.** Delete the suppression and
run the gate. Passing means the rationale had expired; failing tells you which
part is still load bearing. That takes seconds and needs no judgement, so
reach for it rather than re-reading the claim and deciding whether you still
believe it.

Relaxations in `eslint.config.js` need the same treatment and get it least
often, because they sit nowhere near the code they cover and nothing brings
them back into review. Ones left on for rules with no remaining sites have
been found here before.

The same expiry applies to an **external-fact comment** whose fact is about a
tool rather than about the world — what a package defaults to can change with
a version bump, where a file-format offset cannot.

Design rationale is not an external fact. If the reason a `StateField` was
chosen over a `ViewPlugin` matters, the test that would fail under the other
choice is the place to record it.

Project-wide policy belongs in this file, not in code comments.

#### A comment is a defect report about the code

Before writing one, find the change that removes the need for it. The need is
almost never irreducible; it is usually a value, a type or a branch that has
no name yet. Each of these replaced a real comment:

| The comment explains…                          | The change that removes it                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| what a bare literal means                      | a named constant — `''` became `STORE_ROOT` at eight sites                |
| what a `string` or a `null` means in a return  | a type alias — `Promise<RejectionMessage \| null>`                        |
| a multi-clause test written out more than once | a named predicate — `isStoreRow`, which also narrows the type             |
| why a condition is being checked               | a named local — `const neverReachedTheServer = etag === undefined`        |
| how two constants relate                       | derive one — `TOAST_ERROR_MS = TOAST_VISIBLE_MS * ERROR_OUTSTAYS_INFO_BY` |
| why the code behaves as it does                | a test named for that behaviour                                           |
| why code that was never justified exists       | delete the code                                                           |
| a rule that applies project-wide               | a section in this file                                                    |

Verbosity is the cheaper side of this trade. A longer name, an extra alias or
a separate predicate can be tested and cannot fall out of sync; a comment can
do neither. Prefer the code every time the code can carry it.

#### Then, if no change removes it

Only three things reach here: an external fact, a suppression rationale, and
the occasional ordering constraint no type can hold. Check each against:

- **Was it measured, or is it a hypothesis?** Do not state a cause that has
  not been isolated from its confounders. A comment once blamed a `<form>`
  for a password manager's behaviour; the form and the field's `id` changed
  in one commit, and the evidence pointed at the `id`.
- **Does the thing it describes still sit beside it?** A comment about a
  neighbour dies with the neighbour. One outlived the constant it explained
  moving to another module, and went on describing an unrelated function.
- **Does a test or this file already hold it?** Then that is the record.
  Rename the test until it is findable, and delete the comment.

#### The same applies to `test/` and `test-browser/`

Everything above holds for test code, with one addition: in a test the first
move is almost always **renaming the test**. A comment above an `it(...)` is a
sign the name is not carrying its weight, and the name is what a failure
prints.

Two shapes recur and neither is justified:

- **A table of contents.** A comment above a `describe` listing the checks
  below duplicates the names it sits on, and rots the moment a fourth is
  added or one is renamed.
- **A restatement of the assertions.** If the comment says what the test
  asserts, the test already says it.

What can justify one: why a fixture is shaped oddly when the shape is load
bearing — names chosen so that taking the first match would pass, say — or
why a failure is injected rather than provoked for real. Both are facts about
the test that its name cannot hold without becoming a paragraph.

#### Surface what you add to the durable record, as you add it

Two things outlive the change that introduced them: a comment, and a rule in
this file. Both get announced in the reply that introduces them, so a
reviewer can push back while the reasoning is live rather than finding it in
a scan months later.

**For a comment:** quote it, name which justified case it falls under, and
say what you considered changing in the code instead and why that did not
work. One line each.

**For a suppression:** quote it, name the rule, and say which restructurings
were tried and why each failed to remove it. A suppression nobody argued with
is a suppression nobody checked — and unlike a comment, it also switches off
a check, so the cost of getting it wrong compounds.

**For anything added to this file:** quote it, and say why it is policy
rather than a comment, a test name, or nothing at all.

**This is unconditional, and it is the whole review.** Every comment the change
adds gets quoted: a one-liner, one that seems obviously justified, one added in
passing while fixing something else. Nothing fails when a comment is wrong, so
the reply is the only place it can be challenged. **Say so explicitly when a
change adds none** — "no new comments" is a claim a reviewer can check against
the diff, where saying nothing is indistinguishable from having skipped the
step.

Skipping it has a signature worth recognising: comments here have been found
stale, self-cancelling or merely restating the code only when unrelated work
brought the file back into view much later, and each had been added in a commit
whose reply did not quote it. The cost is a line; the alternative is a claim
nobody reads again until it is false.

The second matters more than it looks, because this file is the sanctioned
way out of writing a comment — which makes it the lever you will reach for
when the rule above blocks you. It has been reached for at that scale before:
a single session added around three hundred lines here, much of it rationale
the tests already held.

Three specific traps:

- **A one-off instruction is not policy.** The human may have been giving
  design guidance for the situation in front of you. Writing it here promotes
  it to a standing rule binding every later session, which is a change of
  scope they did not ask for.
- **Wanting to write it down is a signal, not a licence.** If you feel the
  urge to make something policy and nobody asked you to, the likely causes
  are that their instruction was imprecisely worded, or that you have read it
  more broadly than they meant. Both are worth raising. Neither is resolved
  by writing your reading into the rules.
- **These are your instructions.** An addition nobody reviewed changes how
  you behave everywhere, permanently, and it is the one kind of change no
  failing test can catch. Reviewing it is how the two of you stay on the same
  page instead of drifting apart a paragraph at a time.

### 6. Every export is contract; test-only surface lives in `TestOnly`

An export from `src/` is valid only if one of these holds:

1. **Something in `src/`, `scripts/` or `tools/` imports it.** It is the module's
   contract.
2. **It is the module's `TestOnly` container** — one object holding what only
   tests reach for.
3. **It is a type or interface.** A runtime container cannot hold one, so
   types are exempt from the container, though not from needing a consumer.

`export` was the default keystroke rather than a decision: when the rule was
written, nearly half this tree's exports had no consumer of any kind, and a
class added the same morning was already among them.

```ts
function describeError(error: unknown): string { ... }

export const TestOnly = { describeError }
```

**The container is a re-export, not an indirection.** Internal call sites keep
using the local binding, so nothing in production pays for it — and by
construction nothing can be stubbed through it, which is deliberate.

**Why not the `Imports` / `Internals` pattern** from the sibling project: it
was measured against this codebase first: **nothing here stubs an internal**,
and almost every stub point in the suite is on `node:fs`.
`Internals` is a dispatch-stub seam, so it would have added
`Internals.helper()` at every call site to serve a need nothing here has. It
earns its keep in a tree eight times this size with deep dispatch chains; the
equivalent seams here are already function parameters — `startServer(runtime)`,
`createFilesClient(fetchImpl)`, `bootstrap({ navigate })`.

Two mechanisms hold the rule, split by what each does well. **ESLint** blocks
`src/`, `scripts/` and `tools/` from importing `TestOnly`, which it does natively and
precisely. **The conventions suite** owns consumer analysis, which ESLint
cannot do without a new plugin.

**That analysis resolves imports rather than matching identifiers**, because
matching was measured and found to launder dead exports three different ways:
a live export of the same name in another module (`DOC_PREFIX` and `FileKind`
are each declared twice here), a name written in a comment, and — the one
nobody predicts — a module's own filename appearing in an import path, which
is how `bootstrap` stayed hidden while only `bootstrapOrReport` shipped.

A namespace import (`import * as x`) may reach any export, so it marks the
whole module consumed. The remaining limit is transitive: a dead export kept
alive by a dead re-export is only found once the re-export goes, so a cascade
takes two runs to settle.

### 7. Casing says what a name is

| Casing            | For                                                             | Examples                                |
| ----------------- | --------------------------------------------------------------- | --------------------------------------- |
| `SCREAMING_SNAKE` | a fixed literal                                                 | `MOUNT_SELECTOR`, `DEFAULT_LIMITS`      |
| `camelCase`       | a constructed value that gets passed somewhere                  | `defaultRuntime`, `vixenHighlightStyle` |
| `PascalCase`      | a type, a class, or a namespace reached into rather than passed | `ConfigError`, `Runtime`, `TestOnly`    |

`TestOnly` is PascalCase because it is a namespace, which is what JavaScript's
own namespaces are — `Math`, `JSON`, `Object`. It is never passed as a value;
that is what separates it from `defaultRuntime`. A static-only class would say
the same thing, but `@typescript-eslint/no-extraneous-class` rejects one, and
the object literal is what that rule asks for.

## Commands

**`npm test` is the gate.** It is what CI and the Docker build run, and it must
pass before work is handed back.

There is deliberately no second, stricter command. The obvious lever is the
correct one: a narrower `npm test` that quietly skipped type-checking and
coverage would make "tests pass" mean less than it says.

It is wired through npm's `pretest` hook, so the order is:

```
pretest:  format  →  typecheck  →  lint  →  assertions
test:     test:coverage
```

Note `pretest` runs `format`, not `format:check` — the gate **rewrites** files to
Prettier style rather than failing on drift, so there is never a formatting
failure to fix by hand.

That hook fires only for the exact script name `test`. **`npm run test:unit`
and `npm run test:coverage` bypass the static checks** — which is the point of
them, but it means a green `test:coverage` is not a green gate.

| Command                  | Purpose                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `npm test`               | **The gate.** pretest (format, types, lint) then coverage                           |
| `npm run test:all`       | The gate plus the browser suite; needs browser binaries                             |
| `npm run test:unit`      | Vitest alone, no coverage — for a tight edit loop                                   |
| `npm run test:watch`     | Vitest in watch mode                                                                |
| `npm run test:coverage`  | Vitest with the 100% threshold enforced                                             |
| `npm run test:browser`   | Playwright, real Chromium, against built artifacts                                  |
| `npm run build`          | esbuild: server to `dist/`, client to `public/assets/`                              |
| `npm run dev`            | Watch every source dir; rebuild and restart on change                               |
| `npm run format`         | Rewrite files to Prettier style (the fix for a format failure)                      |
| `npm run lint:fix`       | Apply ESLint autofixes                                                              |
| `npm run mutate <files>` | Mutation-test those files against the unit suite — **not part of the gate**         |
| `npm run assertions`     | One claim per test, cross-checked against both runners — **on the `pretest` chain** |

`test:unit` is the shortcut, and it is named so that reaching for it is a
deliberate choice rather than an accident.

**`npm run mutate` answers a question coverage cannot**: 100% says every line
ran, never that anything depended on the result. It rewrites one operator at a
time and re-runs the suite, so a mutant that survives names a line no test
constrains. It costs a full run per mutant, which is why it is a tool to reach
for deliberately and never a gate. It brackets itself with the workspace state
on entry and refuses to report success for a file it found nothing to mutate.

**`npm run assertions` answers a narrower one**: whether each test makes a
single claim, and whether the scanner can see every test there is. It counts
assertions per test, discounting those marked as conditions, then asks
`vitest list` and Playwright's `--list` how many declarations each file holds
and fails on any disagreement.

**The cross-check is the load-bearing half.** The scanner is a regex over
source, and every defect found in it so far has been a wrong answer on input
where every line still ran — a coverage gate would have caught none of them.
An independent enumeration catches the ones nobody predicted, and has:
`it.each<T>(…)` with a type argument, and a whole file excluded by a suffix
allowlist, were both invisible until the runners were asked.

### Run the gate so its exit code survives

**The exit code is the only trustworthy signal, and a pipe destroys it.** A
shell pipeline reports the _last_ command's status, so `npm test | grep …`
exits `0` whenever the grep matches — including when the suite failed. `| tail`
and `| tee` are the same: both return `0` from a failing run.

Use a form that keeps the log and the status together:

```
npm test > run.log 2>&1; echo "exit=$?"; tail -n 40 run.log
```

`run.log` keeps everything, so a failure buried above the fold can be read back
without re-running, and `*.log` is gitignored. Where a pipeline is genuinely
wanted, `set -o pipefail` restores the status.

**A pipe is not the only way to lose it: `$?` holds the _previous_ command's
status, whatever that was.** Anything between the command and the check reads
the wrong one, including something that looks like formatting:

```
npm test > run.log 2>&1; echo; echo "exit=$?"    # reports the bare echo. Always 0.
```

That exact line made a failing gate read as green here, in a session that had
been using the correct form throughout — so knowing the rule is not protection.
Read the status immediately, or save it first (`status=$?`), and never insert a
separator for readability.

**Never decide whether a gate passed by filtering its output.** Coverage
failures print their `ERROR:` lines _after_ the `Tests … passed` line, so a
narrow filter can show a passing test count from a failing run — which is
exactly how a commit once shipped below the threshold with the reply claiming
100%. Filtering is for reading; the exit code is for deciding.

This applies to `npm test`, `npm run build` and `npm run test:browser` alike.
A quick `test:unit` loop can be as sloppy as you like, because nothing is being
claimed about it.

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

**A move puts an entry where nothing is.** An occupied destination is
`ALREADY_EXISTS`, and the user deletes or renames what is in the way. That is
one `rename`, so a move is atomic and costs nothing in bytes however large the
subtree.

Merging two folders and replacing an occupied path are deliberately **not**
supported. Neither was ever asked for: both fell out of checking collisions
per file and recursively, and that check is where every hard case in this file
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

### Naming anything in the markup

A password manager strips separators from an `id`, `name` or `class` and
substring-matches the result. `file-dialog-input` squashes to
`filedialoginput`, which contains **`login`**, and Bitwarden offered to fill
it. `test/server/field-naming.test.ts` scans the rendered page for credential
words so this cannot come back; it is invisible to anyone reading the markup.

## Limits

| Variable                | Default | Enforced                                            |
| ----------------------- | ------- | --------------------------------------------------- |
| `UPLOAD_MAX_BYTES`      | 25 MiB  | `Content-Length` first, then the actual bytes       |
| `ARCHIVE_MAX_BYTES`     | 100 MiB | By walking and measuring **before** any output      |
| `ARCHIVE_MAX_ENTRIES`   | 2000    | As above                                            |
| `WRITE_LOCK_TIMEOUT_MS` | 5000    | How long a write waits before `503 BUSY`; 250–60000 |

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

## Testing

Tests are written first. Two suites, deliberately separate:

- **`test/`** — Vitest, in four projects: `test/server` (node environment),
  `test/client` (happy-dom), `test/shared` (node) and `test/conventions`
  (node). This is the coverage gate and runs inside the Docker build.
- **`test-browser/`** — Playwright. Needs browser binaries the slim runtime
  image does not carry, so it is excluded from `npm test`. Reserve it for
  assertions that require real layout, geometry or paint, and for driving the
  real built artifacts end to end.

  Its `DOCS_ROOT` is emptied at both ends of the run, by a **setup project**
  and a **teardown project**. Both run the same check from
  `test-browser/store.lifecycle.ts` — empty the directory, then assert it is
  empty — so a wipe that stops working fails the suite rather than going
  unnoticed. Emptying at the start is what makes it self-healing: a run killed
  part way through never reaches its teardown, and failing the _next_ run over
  that would punish the wrong person.

  `test-browser/docs-root.ts` owns the one definition of the path, imported by
  both the lifecycle tests and the config that hands it to the server. Two
  copies of that path is how a cleanup silently starts emptying a directory
  the suite does not write to.

  Specs still delete what they create, but that is **isolation, not
  housekeeping** — the suite is `fullyParallel` against one store. Relying on
  it for housekeeping is what rotted: `DELETE` became a soft delete in the
  trash work, and every "cleanup" quietly began filling `.trash` instead of
  emptying it, unnoticed because `data/` is gitignored.

  These are setup and teardown _projects_, not `globalSetup`/`globalTeardown`,
  because those must default-export and rule 3 stays at exactly three files.
  Both projects match the one lifecycle file and pick their half of it with
  `grep` against a `@setup` / `@teardown` tag, which is what lets two tests
  that are three lines apart stay in the same file.

### A test makes one claim

Setup, an optional precondition, the action, and **one assertion for the
behaviour the test is named for**. A test asserting two things is two tests,
and the name usually confesses it: "and", "without" and "not" are reliable
tells, as is "each", which is asking for `it.each`.

Preconditions and waits are written as assertions too, and telling them from
the claim is what `test/conditions.ts` is for:

```ts
given(() => {
  expect(cache.size).toBeGreaterThan(0)
})

cache.clear()

expect(cache.size).toBe(0)
```

Without that gate, a setup that left the cache already empty passes a test
whose subject never ran. `given` marks a synchronous condition, `givenAsync`
an awaited one; both re-throw, because a gate that passed silently would be
worse than no gate. Two names rather than one overload, so that a condition
changing from synchronous to awaited breaks the build instead of being quietly
un-awaited.

**Combining several facts into one object assertion is legitimate only where
no single property means anything alone** — a relation, a pair, a mode, or the
full set of effects a branch has. It is not a way to satisfy the count. Where
the properties stand up separately they are separate tests.

**`npm run assertions` is in the gate**, on the `pretest` chain after `lint`.
It refuses a test that asserts more than once, and any file whose count
disagrees with what the runners list. It costs under a second, so the reason
`npm run mutate` stays out does not apply to it.

**A gate's instrument must be as trustworthy as the gate**, which is why
`tools/assertions.ts` has a spec of its own in `test/conventions/`, with
its fixtures in `.txt` beside it — a fixture naming a test would otherwise be
read as a declaration, and an exemption for the spec file would let the
spec's own tests escape the rule. Every defect the scanner has had was a wrong
answer on input where every line still ran, so coverage would have caught none
of them: the spec pins the shapes that have gone wrong, the cross-check
catches the ones nobody predicted, and
`npm run mutate tools/assertions.ts` is what says the spec constrains
anything.

**`vi.waitFor` is banned outright**, and `test/conventions/` fails the gate on
one. Every wait in this suite turned out to have a definite signal to await —
an injected callback, a promise the code already created and discarded, or a
mutation to the output the test asserts on. So the door is closed rather than
narrowed: it was briefly going to be "legal inside `givenAsync`", and that
would have kept an escape hatch nothing needs. `given` and `givenAsync` stay,
for marking a precondition or a postcondition that is genuinely an assertion
rather than a wait.

**Inventing a waiter is a defect report about the code, not a fix for the
test.** A helper that yields a microtask, or a macrotask, or counts either
until the subject has probably finished, is saying the subject offers no way
to observe that it finished — and the answer is to find the signal, not to
guess at the timing. Look for a callback the code already calls, a promise it
already creates and throws away, or an event the DOM already emits; if none
exists, that absence is the finding.

One such helper lived here, drained the microtask queue with a `setTimeout`,
and was **correct only while no timer was scheduled after its own** — green or
red purely by which `setTimeout` was queued first, with nothing announcing the
difference. So `test/conventions/` also fails on a hand-rolled `setTimeout` or
`setInterval` anywhere in `test/`. Two files are exempt, each because it exists
to exercise the thing the rule forbids: `test/rejections.ts`, where the thing
awaited is the runtime's own unhandled-rejection reporting, which happens at a
macrotask boundary by specification and has no earlier observable moment; and
`test/conventions/timer-guard.test.ts`, which has to schedule a timer to prove
the guard below catches one. `test-browser/` is not covered: there
`page.waitForTimeout` waits on real paint and animation, which is a different
question and not yet settled.

### A repeating timer may not outlive the test that started it

`test/timers.ts` wraps `setInterval` and `clearInterval` and fails any test
that ends with one still scheduled. Every project installs it through a setup
file, so a leak is caught wherever it comes from rather than only where one was
once found.

**Intervals, not timeouts, and the line is principled rather than
convenient.** An interval never completes, so one left behind goes on firing
against a subject the test has abandoned — there is no reading of that which is
not a defect. A pending `setTimeout` is in-flight scheduled work the test
legitimately walked away from: a toast that will expire, an autosave window
that will close. Holding tests to the stricter rule would mean teaching the
toast and autosave lifecycles to be torn down, which is real work and not this
guard's job.

The guard **cancels what it found** before failing, so one leak fails its own
test rather than every test after it in the file. Timers created under
`vi.useFakeTimers()` are deliberately invisible to it, because the fake clock
discards them; the wrapper survives a fake-timer round trip, so a file that
uses them is not thereby excused for the rest of its run.

`bootstrap` is what prompted it: `watchFreshness` returned a cleanup,
`bootstrap` discarded it, and every test that started an editor left an
interval and six `window` listeners behind. That was harmless only by accident
— no test dispatched `focus` in a file that had bootstrapped — and the accident
is the sort that stops holding without warning. The fix is that each of
`watchFreshness`, `guardUnload` and `interceptNavigation` hands back a named
cleanup and `bootstrap` composes them into the `teardownEditor` it returns.

### Nor may a listener on `window` or `document`

`test/client/listeners.ts` is the same idea for the other half of that leak,
and the client setup installs it beside the timer guard. The failure names the
target and the event, because the fix is always "hold the remover something
handed back".

**Only `window` and `document` are watched, and that bound is the design
rather than a shortcut.** A listener on an element the test created dies with
that element, so it cannot accumulate; a listener on a shared target
accumulates once per test and is what fires against an abandoned subject.
Watching every `EventTarget` would report the former as a leak and drown the
signal.

**The cost of that bound is a real gap, and it is worth naming.** A listener
on an element that is long-lived _in production_ but rebuilt per test is
invisible to this guard, because the test's copy is discarded either way.
Registration being bounded across repeated use of such an element is a claim a
test has to make directly, and `test/client/dialogs.test.ts` makes it for the
file dialog — the only element here with that shape.

A `{ once: true }` registration counts as standing until it fires, since one
that never fires is still registered. The guard tracks the firing, so a
one-shot listener that has done its job is not reported.

A guard like this cannot be trusted on inspection — patching the wrong thing
reports silence, which reads exactly like success. `test/client/listeners.ts`
earned its spec by failing that way first: `EventTarget.prototype` is not what
`window.addEventListener` resolves to under this runner, and the instrument
was blind until a deliberately leaked listener was used to prove otherwise.

### The conventions suite enforces this document

`test/conventions/project-rules.test.ts` reads the source tree and fails the
gate on:

- a `.ts` or `.js` file that does not open with `'use sanity'` (rule 2)
- a default export outside the three tooling configs (rule 3)
- an `eslint-disable` or `v8 ignore` with no ` -- rationale` (rule 5)
- an export nothing imports, or a test-only runtime export outside a
  `TestOnly` container (rule 6)
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
- **`src/server/index.ts` is inside the gate.** It is three lines guarded by
  `import.meta.main`, which is false under the runner, so a test can import it
  inertly. Node 26 honours it and esbuild preserves it through bundling. One
  `v8 ignore` covers the guarded call. Add logic here and coverage will demand a
  test for it.
- **`src/client/main.ts` stays excluded**, and stays a mount list: three
  imports and three argument-free calls, no branches and no values chosen. A browser bundle has no
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
