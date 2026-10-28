<p align="center">
  <img src="https://example.com/logo.svg" alt="Tidewater logo" width="120">
</p>

# Tidewater

[![npm version](https://img.shields.io/npm/v/tidewater.svg)](https://www.npmjs.com/package/tidewater)
[![CI](https://github.com/example/tidewater/actions/workflows/ci.yml/badge.svg)](https://github.com/example/tidewater/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Tidewater** is a small, _fast_ and dependency-free job queue for Node.js and
the browser. It keeps jobs in memory, persists them through pluggable
[storage adapters][adapters], and retries failed work with exponential
back-off. Read the [announcement post](https://example.com/blog/tidewater-1-0)
or jump straight to the [quick start](#quick-start).

> **Note**
> Tidewater 2.x requires Node.js 20 or later. If you are stuck on an older
> runtime, use the `1.x` line (`npm install tidewater@1`), which still gets
> security fixes until *December 2026*.

## Table of contents

- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration](#configuration)
  - [Queue options](#queue-options)
  - [Retry policy](#retry-policy)
- [Storage adapters](#storage-adapters)
- [API](#api)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Zero dependencies**: about 4 KB gzipped, tree-shakable ES modules.
- **Typed**: written in TypeScript, ships `.d.ts` files for every entry point.
- **Concurrency control** per queue, with optional *rate limits* (`jobs/second`).
- **Retries** with exponential back-off and jitter; see [Retry policy](#retry-policy).
- **Priorities** from `0` (lowest) to `9` (highest), FIFO within a priority.
- **Pluggable storage**: memory, `localStorage`, IndexedDB, Redis, SQLite.
- **Observability**: events for every state change, plus a `stats()` snapshot.
- Works in Node.js, Deno, Bun, browsers and web workers.

## Installation

```sh
npm install tidewater
# or
pnpm add tidewater
# or
yarn add tidewater
```

With a CDN, no build step required:

```html
<script type="module">
  import { createQueue } from 'https://cdn.example.com/tidewater@2/dist/index.js'
</script>
```

## Quick start

```js
import { createQueue } from 'tidewater'

const queue = createQueue({ concurrency: 4 })

queue.process('email', async (job) => {
  await sendEmail(job.data.to, job.data.subject, job.data.body)
  return { sentAt: Date.now() }
})

await queue.add('email', {
  to: 'ada@example.com',
  subject: 'Welcome!',
  body: 'Thanks for signing up.',
})
```

Jobs run as soon as a worker slot is free. A job that throws is retried
according to the queue's [retry policy](#retry-policy); after the last attempt
it moves to the `failed` state and emits a `failed` event:

```js
queue.on('failed', (job, error) => {
  console.error(`job ${job.id} (${job.name}) failed after ${job.attempts} attempts`, error)
})
```

## Configuration

### Queue options

| Option        | Type                 | Default     | Description                                   |
| ------------- | -------------------- | ----------- | --------------------------------------------- |
| `concurrency` | `number`             | `1`         | Jobs processed in parallel.                   |
| `rateLimit`   | `{ max, perMs }`     | `undefined` | At most `max` jobs every `perMs` milliseconds. |
| `storage`     | `StorageAdapter`     | `memory()`  | Where jobs are persisted.                     |
| `retry`       | `RetryPolicy`        | see below   | How failed jobs are retried.                  |
| `timeout`     | `number`             | `30_000`    | Milliseconds before a running job is aborted. |
| `autostart`   | `boolean`            | `true`      | Start processing as soon as a handler exists. |

### Retry policy

The default policy retries **three times** with exponential back-off:

1. first retry after `1s`;
2. second retry after `2s`;
3. third retry after `4s`, then the job is marked as failed.

Each delay gets up to 20% of random *jitter* to avoid thundering herds. You can
override any field:

```ts
const queue = createQueue({
  retry: {
    attempts: 5,         // total attempts, including the first one
    backoff: 'fixed',    // 'fixed' | 'exponential' | (attempt: number) => number
    delay: 500,          // base delay in ms
    jitter: 0,           // 0..1, fraction of the delay
  },
})
```

> [!TIP]
> Return `queue.skipRetry(error)` from a handler to fail a job immediately,
> for example when the input is invalid and retrying cannot help.

## Storage adapters

| Adapter            | Package                 | Environments        | Durable |
| :----------------- | :---------------------- | :------------------ | :-----: |
| `memory()`         | built in                | everywhere          |   no    |
| `localStorage()`   | built in                | browsers            |   yes   |
| `indexedDb()`      | `@tidewater/idb`        | browsers, workers   |   yes   |
| `redis(client)`    | `@tidewater/redis`      | Node.js, Bun        |   yes   |
| `sqlite(db)`       | `@tidewater/sqlite`     | Node.js, Bun, Deno  |   yes   |

Writing your own adapter means implementing five methods: `load`, `save`,
`remove`, `lease` and `release`. See [`docs/adapters.md`][adapters] and the
reference implementation in [`src/storage/memory.ts`](src/storage/memory.ts).

## API

### `createQueue(options?)`

Creates a queue. All options are optional; see [Queue options](#queue-options).

### `queue.add(name, data, options?)`

Adds a job and returns a promise for its `Job` record. Options:

- `priority` (`number`, default `5`): higher runs first.
- `delay` (`number`, default `0`): milliseconds before the job becomes runnable.
- `id` (`string`): a custom id; adding a job with an existing id is a no-op,
  which makes `add` *idempotent*.

### `queue.process(name, handler)`

Registers the handler for jobs called `name`. The handler receives the job and
an `AbortSignal` that fires on timeout or when the queue is closed:

```js
queue.process('resize', async (job, signal) => {
  const image = await fetch(job.data.url, { signal })
  return resize(await image.arrayBuffer(), job.data.width)
})
```

### `queue.stats()`

Returns counters: `{ waiting, active, completed, failed, delayed }`.

### Events

| Event       | Arguments              | When                                      |
| ----------- | ---------------------- | ----------------------------------------- |
| `added`     | `job`                  | a job was added                           |
| `active`    | `job`                  | a worker picked the job up                |
| `completed` | `job, result`          | the handler resolved                      |
| `failed`    | `job, error`           | the last attempt threw                    |
| `retrying`  | `job, error, delayMs`  | an attempt threw and a retry is scheduled |
| `drained`   |                        | no waiting or active jobs remain          |

## FAQ

**Is Tidewater a replacement for a message broker?**
No. It is an in-process queue. If you need fan-out across machines, use a
broker such as RabbitMQ or NATS and use Tidewater inside each consumer.

**Does it guarantee exactly-once execution?**
No queue can, in general. Tidewater gives *at-least-once* semantics: make your
handlers idempotent (e.g. by using the job `id` as a deduplication key).

**Why not use `setTimeout` directly?**
You can, for a handful of jobs. Tidewater adds persistence, retries,
concurrency limits and observability, which are easy to get subtly wrong.

## Roadmap

- [x] Priorities and delayed jobs
- [x] IndexedDB adapter
- [ ] Repeatable (cron-like) jobs
- [ ] ~~Built-in dashboard~~ moved to the separate `@tidewater/ui` package

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and
open an issue before starting work on a large change. To set up a development
environment:

```sh
git clone https://github.com/example/tidewater.git
cd tidewater
npm ci
npm test
```

Run `npm run lint` before sending a pull request. Benchmarks live in
`bench/` and run with `npm run bench`; please include before/after numbers
for performance-related changes.

***

## License

[MIT](LICENSE) © 2026 The Tidewater authors. Questions? Write to
<maintainers@example.com> or visit https://example.com/tidewater.

[adapters]: docs/adapters.md "Writing a storage adapter"
