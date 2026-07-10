/**
 * `process.kill(pid, 0)` cross‑platform "is this PID alive?"
 * probe. On POSIX it returns `true` for any process the caller
 * could signal (including zombies). On Windows, `process.kill`
 * throws ESRCH for dead PIDs and EPERM for inaccessible live
 * ones; both count as "running" for our purposes (we only want
 * to skip our own start when another supervisor is alive).
 */

export function isProcessRunning(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as { code?: string }).code === 'EPERM';
  }
}
