import { supabase } from '@/integrations/supabase/client';

export interface RepoListOptions {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
}

export function applySoftDeleteFilter<T extends { is: (column: string, value: null) => T }>(query: T): T {
  return query.is('deleted_at', null);
}

export async function softDelete(
  table: string,
  id: string,
  userId?: string | null
): Promise<void> {
  const { error } = await supabase
    .from(table as 'smart_hubs')
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: userId ?? null,
    } as never)
    .eq('id', id);

  if (error) throw error;
}

export function paginateRange(page = 1, pageSize = 20): { from: number; to: number } {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}
