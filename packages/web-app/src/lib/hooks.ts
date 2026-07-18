import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a selected item id in sync with an array: starts with the first item,
 * resets to the first item when the current selection disappears, and clears to
 * `null` when the array becomes empty.
 */
export function useInitialSelection<T, K>(
  items: readonly T[],
  getId: (item: T) => K,
): [K | null, (id: K | null) => void] {
  const getIdRef = useRef(getId);
  getIdRef.current = getId;

  const [selected, setSelected] = useState<K | null>(() => {
    const first = items.at(0);
    return first !== undefined ? getIdRef.current(first) : null;
  });

  useEffect(() => {
    const first = items.at(0);
    if (first === undefined) {
      if (selected !== null) setSelected(null);
      return;
    }
    if (selected === null || !items.some((item) => getIdRef.current(item) === selected)) {
      setSelected(getIdRef.current(first));
    }
  }, [selected, items]);

  return [selected, setSelected];
}
