import { createContext, useContext, ReactNode } from 'react';

interface Plan {
  id: string;
  name: string;
  slug: string;
  features: string[];
}

interface SubscriptionContextType {
  subscription: null;
  plan: Plan | null;
  isLoading: boolean;
  isTrialExpired: boolean;
  isBlocked: boolean;
  needsActivation: boolean;
  allowedFeatures: string[];
  hasFeature: (feature: string) => boolean;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const ALL_FEATURES = [
  'dashboard',
  'funnel',
  'crm',
  'smart_hub',
  'integracoes',
  'automacoes',
  'marketing',
  'landing_pages',
  'analytics',
  'configuracoes',
] as const;

export type Feature = typeof ALL_FEATURES[number];

export const ROUTE_FEATURE_MAP: Record<string, string> = {
  '/': 'funnel',
  '/funil': 'funnel',
  '/crm': 'crm',
  '/smart-hub': 'smart_hub',
  '/integracoes': 'integracoes',
  '/marketing': 'marketing',
};

/**
 * Camada de entitlement standalone.
 * Nesta fase todos os recursos estão liberados para permitir a migração segura.
 * A cobrança por plano/uso será implementada sobre workspace, nunca sobre clínica.
 */
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const allowedFeatures = [...ALL_FEATURES];

  return (
    <SubscriptionContext.Provider
      value={{
        subscription: null,
        plan: null,
        isLoading: false,
        isTrialExpired: false,
        isBlocked: false,
        needsActivation: false,
        allowedFeatures,
        hasFeature: () => true,
        refreshSubscription: async () => undefined,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
