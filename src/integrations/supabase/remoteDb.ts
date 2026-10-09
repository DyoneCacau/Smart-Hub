import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';

/**
 * Cliente sem os tipos gerados de `types.ts` (que descrevem o schema do HealthCare).
 * As tabelas e RPCs deste app estão em supabase/SETUP_NOVO_PROJETO.sql.
 */
export const remoteDb = supabase as unknown as SupabaseClient;
