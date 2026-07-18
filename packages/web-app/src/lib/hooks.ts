import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a selected item id in sync with an array: starts with the first item
 * and resets to the first item when the current selection disappears.
 */
export function useInitialSelection<T, K>(
  items: readonly T[],
  getId: (item: T) => K,
): [K | null, (id: K | null) => void] {
  const getIdRef = useRef(getId);
  getIdRef.current = getId;

  const [selected, setSelected] = useState<K | null>(() => (items[0] ? getIdRef.current(items[0]) : null));

  useEffect(() => {
    const first = items[0];
    if (first && (selected === null || !items.some((item) => getIdRef.current(item) === selected))) {
      setSelected(getIdRef.current(first));
    }
  }, [selected, items]);

  return [selected, setSelected];
}
