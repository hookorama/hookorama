import { useEffect } from 'react';
import { useHookoramaStore } from './store.js';

export function useTicker(): void {
  const paused = useHookoramaStore((state) => state.paused);
  const tickSpeed = useHookoramaStore((state) => state.tickSpeed);
  const tick = useHookoramaStore((state) => state.tick);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(tick, tickSpeed);
    return () => clearInterval(id);
  }, [paused, tickSpeed, tick]);
}
