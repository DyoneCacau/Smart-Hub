import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createLocalId, parseJson, readLocalRaw, subscribeLocal, writeLocal } from '@/lib/localStore';

/** Conteúdo bruto de uma chave do localStorage, sincronizado entre componentes e abas. */
function useLocalStorageRaw(key: string): string | null {
  const subscribe = useCallback((listener: () => void) => subscribeLocal(key, listener), [key]);
  return useSyncExternalStore(subscribe, () => readLocalRaw(key));
}

/** Valor único persistido no localStorage; retorna null enquanto nada foi salvo. */
export function useLocalValue<T>(key: string) {
  const raw = useLocalStorageRaw(key);
  const value = useMemo(() => parseJson(raw) as T | null, [raw]);
  const setValue = useCallback((next: T) => writeLocal(key, next), [key]);
  return [value, setValue] as const;
}

/**
 * Coleção persistida no localStorage e compartilhada entre todos os componentes
 * que usam a mesma chave (inclusive entre abas do navegador).
 */
export function useLocalCollection<T extends { id: string }>(key: string) {
  const raw = useLocalStorageRaw(key);

  const items = useMemo<T[]>(() => {
    const parsed = parseJson(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }, [raw]);

  const write = useCallback((next: T[]) => writeLocal(key, next), [key]);

  const create = useCallback(
    (input: Omit<T, 'id'>): T => {
      const item = { ...input, id: createLocalId() } as T;
      write([...items, item]);
      return item;
    },
    [items, write],
  );

  const createMany = useCallback(
    (inputs: Omit<T, 'id'>[]) => {
      write([...items, ...inputs.map((input) => ({ ...input, id: createLocalId() }) as T)]);
    },
    [items, write],
  );

  const update = useCallback(
    (id: string, changes: Partial<Omit<T, 'id'>>) => {
      write(items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
    },
    [items, write],
  );

  const remove = useCallback(
    (id: string) => {
      write(items.filter((item) => item.id !== id));
    },
    [items, write],
  );

  return { items, create, createMany, update, remove };
}
