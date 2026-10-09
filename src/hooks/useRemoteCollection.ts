import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { remoteDb } from '@/integrations/supabase/remoteDb';
import { createLocalId } from '@/lib/localStore';
import { useClinic } from './useClinic';

type Row = Record<string, unknown>;

export interface RemoteCollectionSpec<T extends { id: string }> {
  table: string;
  /** Campo do app → coluna da tabela. Campos fora do mapa não são enviados. */
  columns: Partial<Record<Exclude<keyof T, 'id'>, string>>;
  fromRow: (row: Row) => T;
  refetchIntervalMs?: number;
}

const EMPTY: never[] = [];

// Gravações em série: um agendamento só é inserido depois do paciente criado no mesmo gesto.
let writeQueue: Promise<unknown> = Promise.resolve();

function toRow<T extends { id: string }>(spec: RemoteCollectionSpec<T>, values: Partial<T>): Row {
  const row: Row = {};
  for (const [key, column] of Object.entries(spec.columns) as Array<[string, string]>) {
    const value = (values as Row)[key];
    if (value !== undefined) row[column] = value === '' && column.endsWith('_id') ? null : value;
  }
  return row;
}

/**
 * Coleção da clínica guardada numa tabela do Supabase, com a mesma interface de
 * useLocalCollection: as mudanças aparecem na hora e são gravadas em segundo plano.
 */
export function useRemoteCollection<T extends { id: string }>(spec: RemoteCollectionSpec<T>) {
  const { clinicId } = useClinic();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['collection', spec.table, clinicId], [spec.table, clinicId]);

  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data: rows, error } = await remoteDb.from(spec.table).select('*').eq('clinic_id', clinicId);
      if (error) throw error;
      return (rows ?? []).map((row) => spec.fromRow(row as Row));
    },
    enabled: isSupabaseConfigured && !!clinicId,
    refetchInterval: spec.refetchIntervalMs,
  });
  const items: T[] = data ?? EMPTY;

  const setItems = useCallback(
    (updater: (prev: T[]) => T[]) => queryClient.setQueryData<T[]>(queryKey, (prev) => updater(prev ?? [])),
    [queryClient, queryKey],
  );

  const persist = useCallback(
    (operation: () => PromiseLike<{ error: { message: string } | null }>) => {
      writeQueue = writeQueue
        .then(operation)
        .then(({ error }) => {
          if (error) throw error;
        })
        .catch((error: unknown) => {
          console.error(`[${spec.table}] falha ao salvar`, error);
          toast.error('Não foi possível salvar no servidor. Os dados foram recarregados.');
          void queryClient.invalidateQueries({ queryKey });
        });
    },
    [queryClient, queryKey, spec.table],
  );

  const create = useCallback(
    (input: Omit<T, 'id'>): T => {
      const item = { ...input, id: createLocalId() } as T;
      setItems((prev) => [...prev, item]);
      persist(() => remoteDb.from(spec.table).insert({ id: item.id, clinic_id: clinicId, ...toRow(spec, item) }));
      return item;
    },
    [clinicId, persist, setItems, spec],
  );

  const createMany = useCallback(
    (inputs: Omit<T, 'id'>[]) => {
      if (inputs.length === 0) return;
      const created = inputs.map((input) => ({ ...input, id: createLocalId() }) as T);
      setItems((prev) => [...prev, ...created]);
      persist(() =>
        remoteDb
          .from(spec.table)
          .insert(created.map((item) => ({ id: item.id, clinic_id: clinicId, ...toRow(spec, item) }))),
      );
    },
    [clinicId, persist, setItems, spec],
  );

  const update = useCallback(
    (id: string, changes: Partial<Omit<T, 'id'>>) => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
      const row = toRow(spec, changes as Partial<T>);
      if (Object.keys(row).length === 0) return;
      persist(() => remoteDb.from(spec.table).update(row).eq('id', id));
    },
    [persist, setItems, spec],
  );

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((item) => item.id !== id));
      persist(() => remoteDb.from(spec.table).delete().eq('id', id));
    },
    [persist, setItems, spec],
  );

  return { items, create, createMany, update, remove };
}
