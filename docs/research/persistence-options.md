# Persistence options for a no-build-step Node 22 backend

Answers [#32](https://github.com/LouisLP/knime-agent-platform/issues/32). Everything below was
measured on this repo's pinned toolchain — Node `22.21.1` (`.node-version`), TypeScript `6.0.3`,
`better-sqlite3@13.0.2` — not read off the docs. The prototype repository in
[§7](#7-the-prototype) was run against the **real test suite** by swapping it into
`chat.service.test.ts` and `server.test.ts`; the two tests it broke are the most useful finding
here and are in [§8](#8-verdict-on-existing-code).

## Recommendation

Use **`node:sqlite`**, file-backed, with a JSON payload column for the per-variant item fields.

```
conversation(id, created_at)
conversation_item(id, conversation_id, created_at, seq, type, payload)
```

Zero dependencies, no build step, no native rebuild, no codegen, and the existing synchronous
`ConversationRepository` interface survives unchanged. Cost: an `ExperimentalWarning` on stdout
and a Stability-1.1 API.

**And correct the README.** "Swapping in a real store is a one-file change" is false as written —
not because of SQLite, but because `ChatService` depends on an undocumented aliasing contract
that only an in-memory `Map` satisfies. It is a **two-file** change (repository + three lines of
`chat.service.ts`), and the second file is the one that matters. See [§8](#8-verdict-on-existing-code).

## 1. Scoreboard

Measured against the four constraints the issue names.

| | `node:sqlite` | `better-sqlite3` | Postgres + `pg` | Postgres + ORM |
| --- | --- | --- | --- | --- |
| Build step | none | none | none | Drizzle: none. Prisma: codegen + engine binary. |
| Install cost | 0 deps | 2 deps, 26 MB on disk | 1 dep | 1–20 deps |
| Native rebuild | n/a | **no** — see [§3](#3-better-sqlite3-the-native-module-objection-is-out-of-date) | n/a | n/a |
| Survives `erasableSyntaxOnly` | yes | yes | yes | decorator ORMs **no** — [§5](#5-erasablesyntaxonly-vs-orm-styles) |
| `ConversationRepository` unchanged | **yes** (sync) | **yes** (sync) | **no** — async ripples to `ChatService`, controllers, tests | no |
| `make dev` unchanged | yes | yes | **no** — adds a service | no |
| Tests stay no-network, no-child-process | yes (`:memory:`) | yes (`:memory:`) | **no** | no |
| API stability | Stability 1.1, Active development | 1.x, stable | stable | stable |

The deciding column is "interface unchanged". `node:sqlite` and `better-sqlite3` are both
*synchronous*, which is why they slot behind an interface whose methods return `Conversation`
rather than `Promise<Conversation>`. Postgres does not — going async rewrites every seam between
the controller and the repository, and the test suite with it. That is a design change dressed as
a storage change.

## 2. `node:sqlite` on the pinned version

Verified by importing it, not by reading the changelog:

| | |
| --- | --- |
| Flag required | **No.** Ran clean with no flag on 22.13.1, 22.14.0, 22.21.1 and 25.1.0. |
| Since | v22.13.0 — *"SQLite is no longer behind `--experimental-sqlite` but still experimental"* ([docs](https://nodejs.org/docs/latest-v22.x/api/sqlite.html)). Added in v22.5.0 behind the flag. |
| Stability | *"Stability: 1.1 — Active development."* Still experimental on 25.1.0. |
| Bundled SQLite | **3.50.4** on 22.21.1 (3.47.2 on 22.13/22.14 — it moves with the Node patch line). |
| JSON1 | compiled in — `json_valid`, `json_extract` available. |
| Warning | `ExperimentalWarning: SQLite is an experimental feature and might change at any time`, once per process, on stderr. |

Exports: `DatabaseSync`, `StatementSync`, `backup`, `constants` (changeset constants only).

```
DatabaseSync.prototype  aggregate, applyChangeset, close, createSession, enableLoadExtension,
                        exec, function, loadExtension, location, open, prepare
                        (+ isOpen, isTransaction as instance properties)
StatementSync.prototype all, columns, get, iterate, run, setAllowBareNamedParameters,
                        setAllowUnknownNamedParameters, setReadBigInts, setReturnArrays
```

Constructor options that exist and are accepted on 22.21.1: `open`, `readOnly`, `timeout`,
`enableForeignKeyConstraints`, `enableDoubleQuotedStringLiterals`, `allowExtension`. Unknown
options are **silently ignored** — a typo'd `enableForeignKeyConstraints` will not throw, it will
just leave foreign keys off. Worth a test.

Rows come back as **null-prototype objects**, not plain `{}`. `deepStrictEqual` against an object
literal fails on that; spreading (`{ ...row }`) or mapping through a constructor fixes it. The
prototype in §7 maps every row explicitly, so nothing null-prototype escapes the repository.

There is no query builder and none is needed at this size: four statements, all parameterised.

### The warning, and what to do about it

It is a real cost — it lands in `npm run dev` output and, during `node --test`, as a TAP comment:

```
# (node:32832) ExperimentalWarning: SQLite is an experimental feature and might change at any time
```

It fails nothing. If it needs silencing, `node --disable-warning=ExperimentalWarning` works
(verified) and is narrower than `--no-warnings`, but it also suppresses genuine warnings from
anything else experimental. My preference: leave it. It is an accurate statement about the
dependency and this is a project where the reviewer reading that line is a feature.

## 3. `better-sqlite3`: the native-module objection is out of date

The issue lists it as "a native module", implying node-gyp. As of **13.0.2** that is no longer
true:

- `package.json` has **no `install`/`postinstall` script**. No node-gyp, no `prebuild-install`, no
  network fetch at install time beyond the tarball itself.
- The tarball ships **eight Node-API prebuilds** — `darwin-{arm64,x64}`, `linux-{x64,arm64}`,
  `linuxmusl-{x64,arm64}`, `win32-{x64,arm64}` — 16 MB of the 26 MB installed footprint.
- Node-API means **ABI-stable across Node majors**. The `engines` field here allows both
  `^22.18.0` and `>=24.12.0`; one binary covers both. That is the objection that would otherwise
  have killed it.
- `npm install better-sqlite3` on a warm cache: **0.9 s**, 2 packages.

It bundles a newer SQLite (3.53.4 vs 3.50.4) and has a nicer API — `db.transaction(fn)`,
`db.pragma()`, `db.backup()`, real `Statement` reuse — plus no experimental warning and a 1.x
stability promise.

So the honest comparison is not "built-in vs. painful native module" but "zero deps and a warning"
vs. "26 MB, eight binaries you don't use, and no warning". At the size of this app the API
difference is worth roughly one helper function. I'd take the zero dependencies; a
`better-sqlite3` swap is the same file and the same shape if the warning ever becomes a problem.

## 4. Postgres

The realistic production answer, and the wrong one here — for reasons that have nothing to do
with Postgres:

1. **It makes the interface async.** `create(): Conversation` becomes
   `create(): Promise<Conversation>`, and that propagates through `ChatService`, both
   controllers, and every test. The seam is honest about being a seam; it is not honest about
   being an *async* seam. Deciding that is a bigger call than choosing a store, and it is the
   thing to change first if Postgres is ever actually the target.
2. **`make dev` grows a dependency it can't provision.** Today `make install && make dev` runs on
   a fresh clone with a single API key. Postgres adds Docker or a local server, a connection
   string, and a first-run migration.
3. **It breaks the test posture.** The suite is deliberately no-network and no-child-process (see
   the docstring in `src/testing/fakes.ts`). Postgres tests need a live server — Testcontainers is
   both a child process *and* a network dependency, and `make check` currently runs in neither.

`pg` itself is fine on the constraints: pure JS, no build step, no decorators. The problem is the
three lines above, not the driver.

## 5. `erasableSyntaxOnly` vs ORM styles

Two results, and the second is a trap.

**Constructor parameter properties are caught at type-check time.** `tsc` under this repo's
config:

```
src/orm.ts:13:15 - error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
  constructor(private readonly db: string) {}
```

`make check` catches it. Good.

**Decorators are not.** `tsc --noEmit` accepts `@Entity()` on a class **with no error** —
decorators are standard-track ES syntax, so `erasableSyntaxOnly` has no opinion on them. But Node
strips types; it does not *transform* anything, and there is no decorator support in the runtime:

```
$ node src/dec.ts
@Entity()
^
SyntaxError: Invalid or unexpected token
```

So a decorator-based ORM (TypeORM, MikroORM, Nest-style repositories) gives a **green
`make check` and a backend that will not boot**. `erasableSyntaxOnly` is not the guard rail it
looks like here — the guard rail is actually running the thing. Rule of thumb: any persistence
library whose entity definitions are decorators is out, and out in a way CI will not tell you
about.

Schema-as-plain-objects libraries (Drizzle, Kysely) are unaffected by this — their schemas are
values, not annotations. Prisma is out for a different reason: `prisma generate` is exactly the
codegen step the constraint forbids.

## 6. Mapping `Conversation` and the `ConversationItem` union to rows

Three candidate shapes for the five-variant union:

| Shape | Verdict |
| --- | --- |
| **Wide table, nullable per-variant columns** | 8 columns, 5 of them null on any given row, and no way to express "`toolCallId` is required *iff* type is `tool_call`". Every read needs a hand-written narrowing step that the type system cannot check. Rejected. |
| **Table per variant** | Five tables, five inserts, and a UNION-ALL-plus-sort to read a conversation back in order. Buys referential integrity nobody is asking for. Rejected. |
| **Shared columns + JSON payload** | Common fields (`id`, `conversation_id`, `created_at`, `type`, `seq`) as real columns; the per-variant remainder as one JSON `payload`. **Chosen.** |

The decider is `ToolCallItem.arguments: unknown`. It holds whatever the model emitted — arbitrary
nested JSON, unbounded shape. There is no column type for it. Once one field must be JSON, the
argument for shredding the other four variants into columns is only "queryability", and there are
no queries: the repository has exactly one read pattern, "give me this conversation's items in
order".

Details that matter:

- **`seq`, not `created_at`, defines order.** `createdAt` is an ISO string stamped by
  `createItem()`; several items inside one turn can share a millisecond, and
  `order by created_at` would then be non-deterministic — reordering a `tool_call` after its
  `tool_result` and corrupting what the model sees on the next iteration. A monotonic `seq` per
  conversation, `unique (conversation_id, seq)`, removes the class of bug.
- **`strict` tables.** SQLite's default type affinity would happily store a number in the `id`
  column. `strict` makes the declared types real. Costs nothing.
- **JSON round-trip is exact.** Verified with a nested-object, unicode, `null`-containing
  `arguments` payload: `JSON.stringify(readBack) === JSON.stringify(original)`, **including key
  order** — because the row maps `id, conversationId, createdAt, type` first and spreads the
  payload after, in the same order `createItem()` produces. API responses do not change shape.
- **Branded ids need no special handling.** `Brand<string, …>` is compile-time only, so ids are
  plain strings going in and a single cast coming out — the same cast the interface already
  implies.
- **Migrations: `pragma user_version`.** An integer in the file header, an array of migration
  functions, apply the ones above the current version at construction time. No migration tool, no
  codegen, no CLI. For a schema this size that is the whole story; the moment it is not, that is
  the moment to reconsider Postgres.

## 7. The prototype

Complete, type-checks clean under this repo's `tsconfig.json`, lints clean under its
`@antfu/eslint-config`, and passes the existing suite (with §8's fix).

```ts
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
create table if not exists conversation (
  id          text primary key,
  created_at  text not null
) strict;

create table if not exists conversation_item (
  id               text primary key,
  conversation_id  text not null references conversation(id) on delete cascade,
  created_at       text not null,
  seq              integer not null,
  type             text not null,
  payload          text not null,
  unique (conversation_id, seq)
) strict;

create index if not exists conversation_item_by_conversation
  on conversation_item (conversation_id, seq);
`

export class SqliteConversationRepository implements ConversationRepository {
  readonly #db: DatabaseSync

  constructor(location = ':memory:') {
    this.#db = new DatabaseSync(location, { enableForeignKeyConstraints: true })
    this.#db.exec('pragma journal_mode = wal')
    this.#db.exec(SCHEMA)
  }

  create(): Conversation {
    const conversation: Conversation = {
      id: newConversationId(),
      createdAt: new Date().toISOString(),
      items: [],
    }
    this.#db
      .prepare('insert into conversation (id, created_at) values (?, ?)')
      .run(conversation.id, conversation.createdAt)
    return conversation
  }

  findById(id: ConversationId): Conversation | undefined {
    const row = this.#db
      .prepare('select created_at from conversation where id = ?')
      .get(id) as { created_at: string } | undefined
    if (!row)
      return undefined

    return { id, createdAt: row.created_at, items: this.#itemsOf(id) }
  }

  getById(id: ConversationId): Conversation {
    const conversation = this.findById(id)
    if (!conversation)
      throw new NotFoundError(`Conversation ${id} not found`)

    return conversation
  }

  appendItems(id: ConversationId, items: ConversationItem[]): Conversation {
    const insert = this.#db.prepare(`
      insert into conversation_item (id, conversation_id, created_at, seq, type, payload)
      values (?, ?, ?, (select coalesce(max(seq), 0) + 1 from conversation_item where conversation_id = ?), ?, ?)
    `)
    this.#db.exec('begin')
    try {
      for (const item of items) {
        const { id: itemId, conversationId, createdAt, type, ...rest } = item
        insert.run(itemId, conversationId, createdAt, conversationId, type, JSON.stringify(rest))
      }
      this.#db.exec('commit')
    }
    catch (error) {
      this.#db.exec('rollback')
      throw error
    }
    return this.getById(id)
  }

  #itemsOf(id: ConversationId): ConversationItem[] {
    const rows = this.#db
      .prepare('select id, conversation_id, created_at, type, payload from conversation_item where conversation_id = ? order by seq')
      .all(id) as { id: string, conversation_id: string, created_at: string, type: string, payload: string }[]

    return rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      createdAt: row.created_at,
      type: row.type,
      ...JSON.parse(row.payload) as object,
    })) as ConversationItem[]
  }
}
```

Measured, file-backed, on 22.21.1:

| | |
| --- | --- |
| `appendItems` of one item, including the full conversation reload it returns | **0.35 ms** (200 iterations) |
| Loading a 200-item conversation | **0.22 ms** |
| Empty database file | 28 KB |
| After `close()` | one `.db` file — WAL checkpointed, no `-wal`/`-shm` left behind |
| Restart | reopen, `getById`, items identical including `arguments` |

A whole turn is ~10 items ≈ 3.5 ms of SQLite against seconds of model latency. Performance is not
a consideration; correctness is.

## 8. Verdict on existing code

**`ChatService` will silently break on any repository that is not the in-memory one.** This is the
finding worth acting on.

`sendMessage` reads the conversation once and hands the object to `#runTurn`, which re-reads
`conversation.items` on **every** loop iteration:

```ts
const conversation = this.#conversations.getById(conversationId)   // read once
…
await this.#runTurn(conversation, turnItems)
…
for (let iteration = 0; …) {
  const messages = toChatMessages(conversation.items, SYSTEM_PROMPT)  // re-read each pass
```

Meanwhile `#record` appends through the repository. That only works because
`InMemoryConversationRepository.appendItems` pushes into *the same array instance* the caller is
holding. The interface never says so. Any repository that returns freshly-built objects — every
real store, by construction — leaves `conversation.items` frozen at the moment of the first read.

Not a hypothetical. Swapping the prototype into the two test files that construct a repository,
changing nothing else:

```
# tests 43
# pass 41
# fail 2
```

Both failures are the same thing — the model is shown an empty history:

```
not ok - shows the model the system prompt, the history and the new message
  actual:   [ 'system' ]
  expected: [ 'system', 'user' ]

not ok - runs the tool and feeds the result back for a final answer
  actual:   [ 'system' ]
  expected: [ 'system', 'user', 'assistant', 'tool' ]
```

In production that is not a crash. It is an agent that forgets the user's message and never sees
its own tool results — it would loop calling the same tool until `MAX_TOOL_ITERATIONS`. The kind
of bug that gets diagnosed as "the model is being dumb".

The fix is three lines: pass the id instead of the object and let `#runTurn` re-read.

```ts
-  await this.#runTurn(conversation, turnItems)
+  await this.#runTurn(conversation.id, turnItems)

-  async #runTurn(conversation: Conversation, turnItems: ConversationItem[]): Promise<void> {
+  async #runTurn(conversationId: ConversationId, turnItems: ConversationItem[]): Promise<void> {

-    const messages = toChatMessages(conversation.items, SYSTEM_PROMPT)
+    const messages = toChatMessages(this.#conversations.getById(conversationId).items, SYSTEM_PROMPT)
```

With it, **43/43 pass against the SQLite repository**, and the in-memory one still passes too —
the change removes a dependency on aliasing rather than trading one for the other. It is also the
right shape regardless of store: re-reading through the repository is what the seam is for.

Two smaller notes:

- `Conversation.createdAt: string` (ISO) already maps to a SQLite `text` column with no
  conversion. Nothing in the domain needs to change for this.
- Making the interface's mutation contract explicit is worth a doc comment on `appendItems`:
  the returned `Conversation` is the truth; the argument you passed in earlier is not.

## 9. What this costs `make check`

- **Type-check** — nothing. `node:sqlite` types ship with `@types/node@24`; `tsc --noEmit` on the
  prototype: 0 errors.
- **Lint** — nothing. Clean under `@antfu/eslint-config`.
- **Tests** — one TAP comment line for the experimental warning. Tests construct the repository
  with the default `':memory:'`, so the suite stays no-network, no-child-process, and no
  temp-file-cleanup. Every existing test keeps working unmodified once §8 is fixed.

Nothing in `make dev`, `make install` or the Makefile changes. A `.gitignore` entry for the `.db`
file, and one `DB_PATH` env var with an in-memory default, is the whole footprint.

## Recommendation, restated

For [#35](https://github.com/LouisLP/knime-agent-platform/issues/35):

1. **Fix `chat.service.ts` first** ([§8](#8-verdict-on-existing-code)) — it is a real bug against
   the current in-memory store's *contract*, independent of which store lands, and it is what the
   "one-file change" claim actually depends on.
2. Add `SqliteConversationRepository` on `node:sqlite` with the schema in
   [§6](#6-mapping-conversation-and-the-conversationitem-union-to-rows).
3. `DB_PATH` in `env.ts`, defaulting to `':memory:'` — the default keeps `make dev` and the tests
   behaving exactly as they do today, and the file path is opt-in.
4. Swap the construction in `container.ts`. That is the second file, and the last one.
5. Update the README bullet: the seam holds, but the number is two files, and say why.

If the experimental warning is unacceptable, `better-sqlite3@13` is a drop-in for step 2 with no
other change ([§3](#3-better-sqlite3-the-native-module-objection-is-out-of-date)). If Postgres is
genuinely wanted, that is a decision about making the repository interface async
([§4](#4-postgres)) and should be argued on those terms, not as a storage swap.
