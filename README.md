# typed-json

A tiny, dependency-free library for typed JSON serialization. Define a schema once to validate incoming data, infer TypeScript types, and round-trip values like `Date`, `bigint`, and `Uint8Array` through plain JSON. Useful for BullMQ payloads, database JSON fields, and other storage boundaries.

## Install

```sh
npm install github:cah4a/typed-json
```

## Usage

```ts
import { j, type TypedJson } from "typed-json";

const payload = j.object({
   id: j.bigint(),
   createdAt: j.date(),
   tags: j.string().array(),
   note: j.string().nullable(),
});

type Payload = ReturnType<typeof payload.parse>;
// { id: bigint; createdAt: Date; tags: string[]; note: string | null }

const data: Payload = {
   id: 42n,
   createdAt: new Date("2026-01-02T03:04:05.678Z"),
   tags: ["billing"],
   note: null,
};

const json = payload.serialize(data); // Plain JSON-compatible value
const restored = payload.parse(JSON.parse(JSON.stringify(json)));
// restored.id is bigint; restored.createdAt is Date

const timestamp: TypedJson<Date> = j.date();
```

For BullMQ, enqueue `payload.serialize(data)` and parse `job.data` in the worker. For a database JSON field, store the serialized value and parse it when reading.

## API

Builders: `j.string()`, `j.number()`, `j.boolean()`, `j.bigint()`, `j.date()`, `j.bytes()`, `j.object(fields)`, `j.record(item)`, `j.tuple(...items)`, and `j.literal(...values)`.

Every schema exposes `.parse(unknown)`, `.serialize(value)`, `.array()`, and `.nullable()`.

- `parse` validates and restores typed values; invalid input throws `TypeError`.
- `serialize` accepts the schema's TypeScript type and returns `unknown`; it does not perform full runtime validation or produce a JSON string.
- Dates become ISO strings, bigints become decimal strings, and bytes become base64 strings. Non-finite numbers become `"NaN"`, `"Infinity"`, or `"-Infinity"`.
- Objects strip unknown keys. `nullable()` maps both `null` and `undefined` to `null` when parsing.

ESM. Node.js 20+. `j.bytes()` uses Node's `Buffer`. No metadata envelope is stored; use the same schema when reading and writing.

## Custom codecs

Use `j.custom({ parse, serialize })` for your own types. It infers the parsed type and supports the same composition helpers as built-in schemas.

```ts
const url = j.custom({
   parse(data) {
      return new URL(j.string().parse(data));
   },
   serialize(data) {
      return data.href;
   },
});

const links = url.nullable().array(); // TypedJson<(URL | null)[]>
```

Custom codecs are responsible for validating input and returning JSON-compatible serialized values.

## Errors

Failures inside objects, arrays, tuples, and records include the full path during parsing and serialization:

```ts
const cart = j.object({ items: j.object({ price: j.number() }).array() });
cart.parse({ items: [{ price: "oops" }] });
// TypeError: items[0].price: Expected number, got "oops"
```

Keys containing punctuation use bracket notation, such as `prices["usd.total"]`. Nested failures, including custom codec errors, are wrapped in a `TypeError` with the original error available as `cause`. Root errors are passed through unchanged.

## Development

```sh
npm install
npm run check
```

MIT
