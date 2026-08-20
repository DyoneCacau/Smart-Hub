import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClinic } from './useClinic';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { generateApiToken, hashSecret, tokenPrefix } from '@/lib/integrationSecurity';
import type { ApiToken, ApiTokenCreated, ApiTokenInput, ApiTokenScope } from '@/types/integration';

const QUERY_KEY = 'api-tokens';
const EMPTY_TOKENS: ApiToken[] = [];

function normalizeToken(row: Record<string, unknown>): ApiToken {
  return {
    id: String(row.id),
    clinic_id: String(row.clinic_id),
    name: String(row.name || ''),
    token_prefix: String(row.token_prefix || ''),
    scopes: Array.isArray(row.scopes) ? (row.scopes as ApiTokenScope[]) : [],
    status: (row.status as ApiToken['status']) || 'active',
    expires_at: (row.expires_at as string) ?? null,
    last_used_at: (row.last_used_at as string) ?? null,
    last_used_ip: (row.last_used_ip as string) ?? null,
    revoked_at: (row.revoked_at as string) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function useApiTokens() {
  const { clinicId } = useClinic();

  const query = useQuery({
    queryKey: [QUERY_KEY, clinicId],
    queryFn: async (): Promise<ApiToken[]> => {
      if (!clinicId) return EMPTY_TOKENS;

      // token_hash não é selecionado: o app nunca precisa dele.
      const { data, error } = await (supabase as any)
        .from('api_tokens')
        .select(
          'id, clinic_id, name, token_prefix, scopes, status, expires_at, last_used_at, last_used_ip, revoked_at, created_at, updated_at',
        )
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') return EMPTY_TOKENS;
        throw error;
      }

      return ((data || []) as Record<string, unknown>[]).map(normalizeToken);
    },
    enabled: !!clinicId,
    retry: false,
  });

  return { ...query, tokens: query.data ?? EMPTY_TOKENS };
}

export function useApiTokenMutations() {
  const { clinicId } = useClinic();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY, clinicId] });
  };

  /**
   * Cria o token do tenant. O valor em claro volta apenas nesta resposta —
   * no banco ficam somente prefixo e hash SHA-256.
   */
  const createToken = useMutation({
    mutationFn: async (input: ApiTokenInput): Promise<ApiTokenCreated> => {
      if (!clinicId) throw new Error('Selecione uma clínica');

      const plainToken = generateApiToken('live');

      const { data, error } = await (supabase as any)
        .from('api_tokens')
        .insert({
          clinic_id: clinicId,
          name: input.name.trim(),
          token_prefix: tokenPrefix(plainToken),
          token_hash: await hashSecret(plainToken),
          scopes: input.scopes,
          expires_at: input.expires_at || null,
          created_by: user?.id ?? null,
        })
        .select(
          'id, clinic_id, name, token_prefix, scopes, status, expires_at, last_used_at, last_used_ip, revoked_at, created_at, updated_at',
        )
        .single();

      if (error) throw error;
      return { token: normalizeToken(data as Record<string, unknown>), plainToken };
    },
    onSuccess: () => {
      invalidate();
      toast.success('Token gerado. Copie agora: ele não será exibido de novo.');
    },
    onError: (error: Error) => {
      toast.error(
        error.message.includes('api_tokens_clinic_id_name_key')
          ? 'Já existe um token com esse nome'
          : 'Erro ao gerar token',
      );
    },
  });

  const revokeToken = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('api_tokens')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_by: user?.id ?? null,
        })
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Token revogado');
    },
    onError: () => toast.error('Erro ao revogar token'),
  });

  const deleteToken = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('api_tokens').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Token excluído');
    },
    onError: () => toast.error('Erro ao excluir token'),
  });

  return { createToken, revokeToken, deleteToken };
}
