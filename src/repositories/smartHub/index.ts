import { isSupabaseConfigured, supabase } from '@/integrations/supabase/client';
import type { SmartHubTemplate, SmartHubDomain, SmartHubPage } from '@/types/smartHub';
import { hubRepository as remoteHubRepository } from './hubRepository';
import { buttonRepository as remoteButtonRepository } from './buttonRepository';
import { assetRepository as remoteAssetRepository } from './assetRepository';
import { themeRepository as remoteThemeRepository } from './themeRepository';
import { analyticsRepository as remoteAnalyticsRepository } from './analyticsRepository';
import {
  localAnalyticsRepository,
  localAssetRepository,
  localButtonRepository,
  localDomainRepository,
  localHubRepository,
  localPageRepository,
  localTemplateRepository,
  localThemeRepository,
} from './localRepositories';

const remoteTemplateRepository = {
  async list(): Promise<SmartHubTemplate[]> {
    const { data, error } = await supabase
      .from('smart_hub_templates')
      .select('*')
      .is('deleted_at', null)
      .eq('status', 'active')
      .order('is_default', { ascending: false })
      .order('name');

    if (error) throw error;
    return (data || []) as SmartHubTemplate[];
  },
};

const remoteDomainRepository = {
  async listByHub(hubId: string, clinicId: string): Promise<SmartHubDomain[]> {
    const { data, error } = await supabase
      .from('smart_hub_domains')
      .select('*')
      .eq('hub_id', hubId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as SmartHubDomain[];
  },

  async create(
    payload: Partial<SmartHubDomain> & {
      clinic_id: string;
      hub_id: string;
      domain: string;
    }
  ): Promise<SmartHubDomain> {
    const { data, error } = await supabase
      .from('smart_hub_domains')
      .insert(payload as never)
      .select('*')
      .single();

    if (error) throw error;
    return data as SmartHubDomain;
  },

  async softDelete(id: string, clinicId: string, userId?: string | null): Promise<void> {
    const { error } = await supabase
      .from('smart_hub_domains')
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: userId ?? null,
        status: 'inactive',
      } as never)
      .eq('id', id)
      .eq('clinic_id', clinicId);

    if (error) throw error;
  },
};

const remotePageRepository = {
  async listByHub(hubId: string, clinicId: string): Promise<SmartHubPage[]> {
    const { data, error } = await supabase
      .from('smart_hub_pages')
      .select('*')
      .eq('hub_id', hubId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('is_home', { ascending: false })
      .order('created_at');

    if (error) throw error;
    return (data || []) as SmartHubPage[];
  },

  async create(
    payload: Partial<SmartHubPage> & {
      clinic_id: string;
      hub_id: string;
      title: string;
    }
  ): Promise<SmartHubPage> {
    const { data, error } = await supabase
      .from('smart_hub_pages')
      .insert(payload as never)
      .select('*')
      .single();

    if (error) throw error;
    return data as SmartHubPage;
  },

  async update(
    id: string,
    clinicId: string,
    payload: Partial<SmartHubPage>
  ): Promise<SmartHubPage> {
    const { data, error } = await supabase
      .from('smart_hub_pages')
      .update(payload as never)
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) throw error;
    return data as SmartHubPage;
  },
};

// Sem Supabase configurado, o Smart Hub persiste tudo no navegador (localRepositories).
export const templateRepository: typeof remoteTemplateRepository = isSupabaseConfigured
  ? remoteTemplateRepository
  : localTemplateRepository;
export const domainRepository: typeof remoteDomainRepository = isSupabaseConfigured
  ? remoteDomainRepository
  : localDomainRepository;
export const pageRepository: typeof remotePageRepository = isSupabaseConfigured
  ? remotePageRepository
  : localPageRepository;
export const hubRepository: typeof remoteHubRepository = isSupabaseConfigured
  ? remoteHubRepository
  : localHubRepository;
export const buttonRepository: typeof remoteButtonRepository = isSupabaseConfigured
  ? remoteButtonRepository
  : localButtonRepository;
export const assetRepository: typeof remoteAssetRepository = isSupabaseConfigured
  ? remoteAssetRepository
  : localAssetRepository;
export const themeRepository: typeof remoteThemeRepository = isSupabaseConfigured
  ? remoteThemeRepository
  : localThemeRepository;
export const analyticsRepository: typeof remoteAnalyticsRepository = isSupabaseConfigured
  ? remoteAnalyticsRepository
  : localAnalyticsRepository;
