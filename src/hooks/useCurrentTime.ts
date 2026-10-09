import { useEffect, useState } from 'react';

/** Hora atual, atualizada periodicamente (padrão: a cada 30s). */
export function useCurrentTime(refreshIntervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), refreshIntervalMs);
    return () => clearInterval(interval);
  }, [refreshIntervalMs]);

  return now;
}
