# `@hookorama/web-app`

The local web dashboard. Reads from the supervisor's HTTP/WS
interface on `127.0.0.1:7354` (the only network surface in the
system) and renders the panorama: agents, processes, history,
analytics, web terminal.

This is a Vite + React + TanStack Router SPA. It is built with
`vite` and served by the CLI in PR 3.

## Public API

```ts
import { PLACEHOLDER } from '@hookorama/web-app';
```

> The app is not a library; `src/index.ts` is a placeholder barrel.
> The real entry point is `src/main.tsx`.

## Pinned by

- ADR(s): `0003`
- Rules: `.agents/rules/package-readme.md.rule`
- Skills: none
