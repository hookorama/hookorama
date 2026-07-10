/**
 * `@hookorama/client` — public barrel.
 *
 * This file is intentionally empty in PR 1 (the bootstrap). Real
 * exports land in PR 2 with the supervisor's shape ADR.
 *
 * Conventions enforced here:
 *   - Public types and helpers are exported from this barrel only.
 *   - Internal modules stay under `src/` without a barrel.
 *   - No `vscode` imports anywhere in this package.
 */

export const PLACEHOLDER = true as const;