# vixen-editor — instructions

A markdown editor: a Hono API serving a VanillaJS + CodeMirror 6 front end, with
documents persisted to the filesystem.

Three documents sit beside this one. [README.md](README.md) is how the project
is **used**. [DESIGN.md](DESIGN.md) is how it is **built**. [TESTING.md](TESTING.md)
is how it is **tested**. All three are written for the human as much as for you,
and they carry the detail and the rationale that this file only points at.

**Everything binding on you is in this file.** Those three documents explain and
justify; they never hold a rule you could only discover by reading them. So a
turn that never opens them cannot violate one by accident — but a turn that
changes the project's design, its tests, or how it is used should open the
matching document, because that is where the reasoning lives and where a change
has to stay consistent.

Links out of this file use opaque anchors — `DESIGN.md#design-25e739` rather
than a readable slug. A readable anchor is a claim about the section it names,
and claims rot: reword the heading and the anchor either lies or gets
"corrected", breaking every link to it. An identifier makes no claim. Do not
rename one, and do not reach for a readable one when adding a section.

## Ground rules

These are not suggestions. They take precedence over habit and over what the
surrounding ecosystem commonly does.

<a id="claude-d14a88"></a>

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

<a id="claude-424991"></a>

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

<a id="claude-bf81d4"></a>

### 3. `export default` is forbidden

Use named exports. The only permitted uses are where external tooling requires a
default export, which currently means exactly three files:

- `vitest.config.ts`
- `eslint.config.js`
- `test-browser/playwright.config.ts`

<a id="claude-de06b1"></a>

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

<a id="claude-b4ea1e"></a>

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

Everything here holds for test code, with one addition that has its own
section: see [comments in a test](TESTING.md#testing-80b1b6).

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

<a id="claude-f5a609"></a>

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

<a id="claude-91b957"></a>

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

## Running the gate

**`npm test` is the gate.** It is what CI and the Docker build run, and it must
pass before work is handed back. What each command does, and why there is
deliberately no second stricter one, is in
[TESTING.md](TESTING.md#testing-36cd3f).

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

## Announce a raised browser floor

The supported floor is recorded in
[DESIGN.md](DESIGN.md#design-79c76a) and is measured rather than assumed.

**Raising it is a product decision wearing a technical hat, so surface it in the
reply that makes it**, the way a new comment or suppression is: name the
feature, the versions, and what breaks below them. Say whether the floor is
_hard_ (the feature throws below it) or _soft_ (it degrades). The human pushes
back if it is too aggressive.

That obligation exists because this has already slipped through twice.
`Promise.withResolvers` moved Chrome from 112 to 119 in a commit about
suppressions, and `keepalive` moved Firefox from 121 to 133 in the next one.
Neither was noticed until the floor was being written down, and neither was a
decision anyone made on purpose.

**Before MVP there are no users, so raising the floor is the cheap lever.**
Reach for it _before_ contorting code to fit the current one.

## Waits in a test

Three things are refused outright, and the gate fails on each:

- **`vi.waitFor`** anywhere in `test/`
- **a hand-rolled `setTimeout` or `setInterval`** in `test/`, with two named
  exceptions
- **`page.waitForFunction`** anywhere in `test-browser/`

**Inventing a waiter is a defect report about the code, not a fix for the
test.** A helper that drains microtasks, or counts macrotasks until the subject
has probably finished, is saying the subject offers no way to observe that it
finished — and the answer is to find the signal, not to guess at the timing.
Look for a callback the code already calls, a promise it already creates and
throws away, or an event the DOM already emits; if none exists, that absence is
the finding.

Why each ban exists, which files are exempt and why, and when the weakest of
them may be relitigated, are in [TESTING.md](TESTING.md#testing-16daba).

## Every other binding rule, in one place

The ground rules above are the ones with rationale you need while working. These
are the rest. Each is stated here so that a turn which never opens
[DESIGN.md](DESIGN.md) or [TESTING.md](TESTING.md) still cannot break one; the
link is where the reasoning and the incident that produced it live. Most are
enforced — a gate failure is the normal way to find out — but **do not rely on
that**: some are only enforceable by review.

### Writing code

- **All authored source lives under `src/`.** New source directories go there
  and nowhere else. → [DESIGN](DESIGN.md#design-1ab8b5)
- **`server/` and `client/` may not import each other, and `shared/` may not
  import either.** A module reaches `shared/` only when both sides import it.
  → [DESIGN](DESIGN.md#design-17dbc3)
- **Two sibling areas under `src/` may not import each other at runtime.** A
  type-only backlink is tolerated where extracting the type is not cheap and
  logical; prefer to avoid it. → [DESIGN](DESIGN.md#design-535790)
- **Nothing in `src/` calls `writeFile` on a store path.** Writes go through
  `replaceFileAtomic` or `createFileAtomic`. → [DESIGN](DESIGN.md#design-0d781c)
- **The API never rewrites stored content.** The single exception is a move
  repairing the links it broke, and it is narrow in four stated ways.
  → [DESIGN](DESIGN.md#design-eae374)
- **SVG is never inlined into the DOM.** → [DESIGN](DESIGN.md#design-9477d0)
- **No `console.*` in shipped code**, and nothing writes to `stdout` or
  `stderr` directly. Diagnostics go through `createLogger`.
  → [DESIGN](DESIGN.md#design-72c03f)
- **Every key the app binds is named in `src/client/help.ts`.** A shortcut
  missing from the cheatsheet cannot be bound at all.
  → [DESIGN](DESIGN.md#design-e6bdab)
- **Do not subset the icon font**, and **do not rename the `cm-vixen-*`
  decoration classes** — restyle them instead.
  → [DESIGN](DESIGN.md#design-15c5ed)
- **Shipped code switches no ESLint rule off.** Prefer fixing the code, then an
  inline suppression with a rationale; a scoped override in `eslint.config.js`
  is the last resort and needs adding to an approved list.
  → [DESIGN](DESIGN.md#design-15c5ed)

### Writing tests

- **Tests are written first.** → [TESTING](TESTING.md#testing-58c0e4)
- **A test makes one claim**: setup, an optional precondition, the action, and
  one assertion for the behaviour the test is named for. A precondition or an
  awaited postcondition is marked with `given` or `givenAsync` so it is not
  counted as the claim. → [TESTING](TESTING.md#testing-16daba)
- **A test under `test/` shadows the module it tests**, mirrored from `src/`,
  or sits in a folder named for that module. `test/conventions/` is the only
  directory that does not mirror. → [TESTING](TESTING.md#testing-4c6769)
- **A spec under `test-browser/` is named for one cohesive behaviour**, not for
  a module. → [TESTING](TESTING.md#testing-4c6769)
- **Coverage stays at 100% on all four metrics**, and `src/client/main.ts` is
  the only exclusion. Do not add another; prefer making a branch testable over
  suppressing it. → [TESTING](TESTING.md#testing-c07f46)
- **The test suite is completely silent.** → [DESIGN](DESIGN.md#design-72c03f)

### Writing these documents

- **Prefer enforcing a rule over restating it**, and **do not write counts into
  any of these documents** — a number is a promise to come back and re-sync,
  which nobody does. → [TESTING](TESTING.md#testing-924694)
- **A table that copies a rule the code owns gets a check that the two agree.**
  The name rules and the error codes each have one, because a prose copy went
  silently false before. → [TESTING](TESTING.md#testing-924694)
- **A link between these documents uses an opaque anchor**, prefixed with the
  document that holds it. `test/conventions/` fails the gate on a link to an
  anchor nothing declares, on an id declared twice, and on an anchor whose
  prefix names a different document — so a dead link cannot reach a reader.
  → [TESTING](TESTING.md#testing-924694)

## Where the detail lives

| For                                               | Read                                    |
| ------------------------------------------------- | --------------------------------------- |
| what the project is and how to run it             | [README.md](README.md)                  |
| the document store, its names, moves and trash    | [DESIGN.md](DESIGN.md#design-9ca2c0)    |
| ETags, the write lock, what blocks what           | [DESIGN.md](DESIGN.md#design-e1ba9e)    |
| URLs, and how the editor follows a moved document | [DESIGN.md](DESIGN.md#design-4856aa)    |
| serving files we did not author                   | [DESIGN.md](DESIGN.md#design-9477d0)    |
| API error codes and what each carries             | [DESIGN.md](DESIGN.md#design-e8c160)    |
| logging, and why `DEBUG` is re-applied            | [DESIGN.md](DESIGN.md#design-72c03f)    |
| what each directory under `src/` means            | [DESIGN.md](DESIGN.md#design-d7fa84)    |
| the toolchain, and what must not be "optimised"   | [DESIGN.md](DESIGN.md#design-15c5ed)    |
| the commands, and what the gate actually runs     | [TESTING.md](TESTING.md#testing-36cd3f) |
| where a test file goes                            | [TESTING.md](TESTING.md#testing-4c6769) |
| one claim per test, and how waits are marked      | [TESTING.md](TESTING.md#testing-16daba) |
| the coverage gate and its one exclusion           | [TESTING.md](TESTING.md#testing-c07f46) |
