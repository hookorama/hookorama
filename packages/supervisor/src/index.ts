/**
 * `@hookorama/supervisor` — public barrel.
 *
 * Re‑exports the real supervisor surface; consumers depend on
 * `import { … } from '@hookorama/supervisor'`.
 */

export { Supervisor, SupervisorProcess } from './supervisor.js';
export { runSupervisorDaemon } from './run.js';
export { WireServer } from './wire/server.js';
export type { WireServerOptions } from './wire/server.js';
export type { ProcessDiscovery, ProcessRow } from './process-discovery/index.js';
export type { OpenTerminal, ResolvedIdentity } from './identity/resolve.js';
export type { ProcessEntry, Status } from './state/store.js';
export { pidFilePath, acquirePidSlot, releasePidSlot } from './lifecycle/pid-file.js';
export { isProcessRunning } from './lifecycle/pid.js';
