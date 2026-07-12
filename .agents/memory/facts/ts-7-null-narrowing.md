---
id: ts-7-null-narrowing
type: fact
tags: [typescript, tsc-7, vitest, narrowing]
created: 2026-07-12
summary: TypeScript 7 narrows a `let x: T | null = null` to the `null` literal, so `if (x !== null)` becomes `never`; use `let x = null as T | null` instead.
---

# TypeScript 7 narrows `let` initialized with `null` to the literal `null`

In `tsc` 7.0, a `let` variable declared with a `null` initializer and a union type is
narrowed to the `null` literal. Subsequent `if (x !== null)` checks treat the variable
as `never` inside the truthy branch, because `tsc` does not see the assignment in an
asynchronous callback or `await` before the check.

Example that errors with `TS2339`:

```ts
let x: string | null = null;
setTimeout(() => { x = 'hello'; }, 0);
if (x !== null) {
  x.length; // Error: Property 'length' does not exist on type 'never'
}
```

Workaround: initialize with a type assertion:

```ts
let x = null as string | null;
setTimeout(() => { x = 'hello'; }, 0);
if (x !== null) {
  x.length; // OK
}
```

This matters when a test uses a `let` assignment inside a callback that is resolved
later, such as `client.setOnSnapshot((snapshot) => { initialSnapshot = snapshot; })`.
