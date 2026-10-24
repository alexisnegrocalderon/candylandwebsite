import { useEffect, useState } from 'react';

/** El valor, pero recién cuando deja de cambiar por `ms`: para buscar mientras se escribe sin pedirle
 * al servidor una vez por tecla. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
