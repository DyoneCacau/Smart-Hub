/**
 * Armazenamento no localStorage com notificação entre componentes e abas.
 * Usado pelos hooks de dados locais e pelos serviços que rodam sem backend.
 */

const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

export function createLocalId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function subscribeLocal(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);

  const onStorage = (event: StorageEvent) => {
    if (event.key === key) listener();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    set.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function readLocalRaw(key: string): string | null {
  return localStorage.getItem(key);
}

export function readLocal<T>(key: string): T | null {
  return parseJson(localStorage.getItem(key)) as T | null;
}

export function readLocalList<T>(key: string): T[] {
  const parsed = readLocal<unknown>(key);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('O armazenamento do navegador está cheio. Remova imagens ou dados antigos.');
    }
    throw error;
  }
  notify(key);
}
