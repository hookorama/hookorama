---
id: jsx-namespace-not-global
type: fact
tags: [typescript, react, web-app, jsx]
created: 2026-07-10
summary: With module: NodeNext and jsx: react-jsx, the JSX global namespace is not visible; use ReactElement from react for return types.
---

# `JSX` namespace is not global in `NodeNext` + `react-jsx`

The `packages/web-app` tsconfig uses `module: NodeNext` and `jsx: react-jsx`.
`oxlint` enforces `explicit-module-boundary-types`, so exported components must
declare a return type. Writing `JSX.Element` fails with `TS2503: Cannot find namespace 'JSX'`.

Instead, import `ReactElement` from `react` and use `ReactElement | null` for
components that can return `null`:

```ts
import type { ReactElement } from 'react';
export function MyComponent(): ReactElement { ... }
```

This is also a reminder that `module: NodeNext` makes the `JSX` global available
only for classic `jsx: react` mode, where `React` is imported explicitly. In
`react-jsx` mode the namespace is not automatically global.
