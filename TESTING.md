# vixen-editor — testing

<a id="testing-36cd3f"></a>

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

<a id="testing-58c0e4"></a>

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
  because those must default-export and [rule 3](CLAUDE.md#claude-bf81d4) stays at exactly three
  files.
  Both projects match the one lifecycle file and pick their half of it with
  `grep` against a `@setup` / `@teardown` tag, which is what lets two tests
  that are three lines apart stay in the same file.

<a id="testing-4c6769"></a>

### A unit test shadows the module it tests

`test/` mirrors `src/`, so the relative path from `test/` names the source: the
test for `src/client/editor/autosave.ts` is
`test/client/editor/autosave.test.ts`. Where one module needs several test
files they go in a folder named for the module, which is what
`test/client/editor/bootstrap/` is. A test utility is tested beside itself, so
`test/client/listeners.ts` has `test/client/listeners.test.ts`.

**`test/conventions/` is the one directory that does not mirror**, because its
tests have no module under test. They assert properties of the repository
rather than behaviour of the product: that the rules in [CLAUDE.md](CLAUDE.md) hold,
that the suite is silent, that the markup spells no credential word, that the
assertion scanner is sound.

Two checks hold this, and **the second matters more than the first**. The
mirror is checked against the source tree; and every test file must match
**exactly one** vitest project, because a mirrored path outside every `include`
does not fail — it silently does not run. A basename collision once destroyed
three test files here while the suite still reported a pass, and only counting
files against `git ls-tree` found it.

**`test-browser/` is organised the other way round**, and deliberately so. It
drives the built application rather than any one module, so a spec named for a
module would name something it only reaches through five others. Its specs are
named for the behaviour they exercise — `saving`, `navigation`, `trash`,
`document-links` — and each holds one cohesive behaviour. That is a looser rule
with real room for judgement about where one behaviour ends and the next
begins, and that is accepted rather than worked around. Shared setup lives in
`test-browser/fixtures.ts` so a spec does not carry its own copy.

<a id="testing-3b7e1c"></a>

### The browser suite shares one store, and specs must survive each other

`test-browser/` runs `fullyParallel` against a single `DOCS_ROOT`, so every
spec's writes reach every other spec's open page. That is not an accident to be
engineered away. A change made by another client is something the running
application has to survive, and the shared store is the only place this project
exercises it at all.

It earned its keep the first time the client listened to the change channel, by
finding two faults that would reach a user and that nothing else was watching:
`renderTree` rebuilt every row on each draw, so a gesture spanning a redraw
died; and the empty-trash button kept its confirmation state in `dataset.armed`
on an element the tree owns, so a redraw silently disarmed it and a second click
re-armed instead of deleting.

**So resilience is a requirement, and it gets tests of its own.** A spec that
drives change while the page is in use — a second client writing, moving and
deleting while a drag, a two-click confirmation or a focused row is in flight —
is a _chaos spec_, and it belongs in `test-browser/` named for the behaviour it
protects.

**Write them deliberately rather than harvesting the suite's own cross-talk.**
Cross-talk fails in whichever spec happens to be mid-gesture, so the red test
names something unrelated to the cause, the set changes between runs, and
nothing tells you whether a fix worked. Eight failures were collected that way
once, across six specs, none of which had anything to do with the change that
caused them. A chaos spec fails in one place, for one reason, every time.

**Where a spec genuinely cannot survive the store being shared, stub the
collision rather than serialising the suite.** Emptying the trash is the
example, because it is the one action that reaches every other spec's fixtures:
`trash.spec.ts` intercepts that request and answers it, so the path from the
button to the request is still exercised.

**A contamination stub is the narrowest thing that removes the collision, and
never a line wider.** Every stub buys isolation by taking a piece of the system
out of the test, so it can hide a regression nothing else would catch. Before
writing one, name the unit test that fails if the stubbed behaviour breaks — if
there is none, the stub is covering untested ground, and the test to write is
that one rather than the stub. Prefer narrowing an assertion to the spec's own
fixtures over stubbing at all, which is what a timestamped fixture name is for;
then a single request over a client, a client over a module, and a module over
any mode of the suite.

<a id="testing-16daba"></a>

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
`test/timers.test.ts`, which has to schedule a timer to prove
the guard below catches one.

**`test-browser/` has two rules of its own rather than an exemption.** A
`page.waitForTimeout` may not take a bare number: a kept duration has to name
what it outlasts, and the ones that remain are derived from the production
constant they must outlive, so they cannot drift from it. And
`page.waitForFunction` is refused outright — polling is neither a signal nor a
duration but a repeated guess, and a retrying `expect` or a promise has served
instead every time. `document.fonts.ready` replaced the last one.

A duration earns its place there only where the test proves a **non-event** —
that a tooltip did not appear, or did not vanish — because nothing can signal
something that does not happen.

**The polling ban rests on one site rather than a survey**, which is weaker
ground than the `vi.waitFor` ban above, where every one of its sites was
examined first. It is there to hold the count at zero, not because every
alternative has been proved. A change with no clean solution without it is
grounds to relitigate the ban, not to work around it.

<a id="testing-748822"></a>

### No timer outlives the test that started it

`test/timers.ts` wraps both kinds and every project installs it through a setup
file, so a stray timer is caught wherever it comes from rather than only where
one was once found. **The two kinds are treated differently, and the line is
principled rather than convenient.**

**An interval fails the test.** It never completes, so one left behind goes on
firing against a subject the test has abandoned — there is no reading of that
which is not a defect.

**A timeout is cancelled, not failed.** It is in-flight scheduled work the test
legitimately walked away from: a toast that will expire, an autosave window
that will close. Nobody wrote a defect by leaving one pending, so failing would
punish the wrong thing — but letting it survive the test is what made the gate
flaky, so `dropPendingTimeouts` cancels what is still outstanding.

**Why it had to change.** A pending timeout outlives the _environment_ as well
as the test: its callback runs after happy-dom has taken `window` away, and the
first thing a toast does on expiry is read `window.matchMedia`. The gate failed
about one run in five with `ReferenceError: window is not defined`, reported
against whichever file happened to be running, with every test passing and
coverage at 100% — the exit code was the only thing that said anything was
wrong. Measured before the fix: 269 tests ended holding at least one timer, and
one file ended holding 184.

An earlier note here predicted that enforcing this would mean teaching the toast
and autosave lifecycles to be torn down. It did not, because cancelling is not
enforcing: the harness drops what the test abandoned, and no production code
changed. Nothing here is a reason to leave a timer pending on purpose — it is a
reason not to have to care.

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

<a id="testing-820f47"></a>

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
test has to make directly, and `test/client/files/dialogs.test.ts` makes it for the
file dialog — the only element here with that shape.

A `{ once: true }` registration counts as standing until it fires, since one
that never fires is still registered. The guard tracks the firing, so a
one-shot listener that has done its job is not reported.

A guard like this cannot be trusted on inspection — patching the wrong thing
reports silence, which reads exactly like success. `test/client/listeners.ts`
earned its spec by failing that way first: `EventTarget.prototype` is not what
`window.addEventListener` resolves to under this runner, and the instrument
was blind until a deliberately leaked listener was used to prove otherwise.

<a id="testing-1f93ac"></a>

### What bounds a hang, and what does not

`testTimeout` bounds a test that **waits**. It does not bound one that
**spins**: a synchronous loop holds the event loop that would run the timer, so
the timeout never fires and the per-project bounds buy nothing. Measured at
`testTimeout: 1000` against a test that ran for ninety seconds.

**Nothing can enforce this**, because any guard would need the thread the spin
is holding. So it is written down instead, which is the one case this document
prefers prose to a check.

It surfaced through `npm run mutate`, the one thing here that _creates_
spinning code on purpose — mutating a loop bound (`' < '` to `' <= '`) produces
a loop that never ends. **The damage was not the hang but what outlived it.**
`execFile`'s timeout signals only the process it started, so the signal reached
`npx` and neither vitest nor its forked workers; both reparented to PID 1 and
spun at 100% CPU until they were found days later. The runner now spawns
detached and kills the whole process group, and
`test/conventions/mutate.test.ts` fails if that is simplified back to a plain
`execFile` timeout.

**For `npm test` the same blindness is much milder**, and worth recognising
rather than fixing: the parent stays attached, so Ctrl-C works and nothing is
orphaned. A gate that appears wedged with no timeout firing is this, and the
cause is a synchronous loop in the code under test rather than anything in the
suite.

<a id="testing-924694"></a>

### The conventions suite enforces the rules

`test/conventions/project-rules.test.ts` reads the source tree and fails the
gate on:

- a `.ts` or `.js` file that does not open with `'use sanity'` ([rule 2](CLAUDE.md#claude-424991))
- a default export outside the three tooling configs ([rule 3](CLAUDE.md#claude-bf81d4))
- an `eslint-disable` or `v8 ignore` with no ` -- rationale` ([rule 5](CLAUDE.md#claude-b4ea1e))
- an export nothing imports, or a test-only runtime export outside a
  `TestOnly` container ([rule 6](CLAUDE.md#claude-f5a609))
- a file under `src/` matched by neither or both typecheck projects
- a test under `test/` that shadows no module and is not in `test/conventions/`
- a test under `test/` that no vitest project runs, or that two would run
- two sibling areas under `src/` that import each other at runtime

This exists because a rule that lives only in prose rots. `src/client/main.ts` grew
to ~35 lines of untested logic inside a coverage exclusion while this file
claimed entry points were logic-free, and the "exactly one `v8 ignore`" line
here was stale within a day of being written.

So: **prefer enforcing a rule over restating it, and do not write counts into
this file.** A number here is a promise to come back and re-sync, which nobody
does. The scanner skips its own source, since it would otherwise match the
patterns it searches for; everything else is checked.

<a id="testing-c07f46"></a>

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

<a id="testing-80b1b6"></a>

### Comments in a test

[Rule 5](CLAUDE.md#claude-b4ea1e) holds for test code too, with one addition: in a test the first
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
