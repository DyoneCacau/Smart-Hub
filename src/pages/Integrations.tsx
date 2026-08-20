import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Plug, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IntegrationCard } from '@/components/integrations/IntegrationCard';
import { IntegrationFormDialog } from '@/components/integrations/IntegrationFormDialog';
import { AutomationFlowsPanel } from '@/components/integrations/AutomationFlowsPanel';
import { IntegrationLogsPanel } from '@/components/integrations/IntegrationLogsPanel';
import { ApiTokensPanel } from '@/components/integrations/ApiTokensPanel';
import { LeadsApiPanel } from '@/components/integrations/LeadsApiPanel';
import { MetaCard } from '@/components/integrations/MetaCard';
import { MetaConnectionDialog } from '@/components/integrations/MetaConnectionDialog';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useIntegrations } from '@/hooks/useIntegrations';
import {
  INTEGRATION_CATEGORY_LABELS,
  INTEGRATION_PROVIDERS,
  type IntegrationProviderDefinition,
} from '@/lib/integrationProviders';
import type { Integration, IntegrationCategory } from '@/types/integration';

const CATEGORY_ORDER: IntegrationCategory[] = [
  'ads',
  'messaging',
  'forms',
  'automation',
  'api',
];

export default function Integrations() {
  const { isSuperAdmin } = useAuth();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const { integrations, isLoading } = useIntegrations();
  const [searchParams, setSearchParams] = useSearchParams();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDefinition, setSelectedDefinition] =
    useState<IntegrationProviderDefinition | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);

  const [metaDialogOpen, setMetaDialogOpen] = useState(false);
  const [metaIntegration, setMetaIntegration] = useState<Integration | null>(null);
  const [metaAutoAssets, setMetaAutoAssets] = useState(false);

  const canView = isSuperAdmin || can('integracoes', 'can_view');
  const canCreate = isSuperAdmin || can('integracoes', 'can_create');
  const canEdit = isSuperAdmin || can('integracoes', 'can_edit');
  const canDelete = isSuperAdmin || can('integracoes', 'can_delete');

  const metaConnection = useMemo(
    () => integrations.find((item) => item.provider === 'meta') ?? null,
    [integrations],
  );

  const byProvider = useMemo(() => {
    const map = new Map<string, Integration[]>();
    for (const integration of integrations) {
      if (integration.provider === 'meta') continue;
      const list = map.get(integration.provider) || [];
      list.push(integration);
      map.set(integration.provider, list);
    }
    return map;
  }, [integrations]);

  const catalogProviders = useMemo(
    () => INTEGRATION_PROVIDERS.filter((provider) => provider.id !== 'meta'),
    [],
  );

  useEffect(() => {
    const metaResult = searchParams.get('meta');
    if (!metaResult) return;
    // Evita limpar a query antes das integrações carregarem (perdiamos o dialog).
    if (isLoading) return;

    const integrationId = searchParams.get('integration_id');
    const reason = searchParams.get('reason');

    const target =
      (integrationId
        ? integrations.find((item) => item.id === integrationId) ?? null
        : null) || metaConnection;

    if (metaResult === 'error') {
      toast.error(reason || 'Falha ao conectar com a Meta');
    } else if (metaResult === 'assets') {
      if (!target) {
        toast.error(
          'OAuth concluído, mas a conexão Meta não foi encontrada nesta clínica. Confira a clínica ativa e reconecte.',
        );
      } else {
        toast.success('Meta autorizada. Selecione a Página do Facebook.');
        setMetaAutoAssets(true);
        setMetaIntegration(target);
        setMetaDialogOpen(true);
      }
    } else if (metaResult === 'connected') {
      toast.success('Conexão Meta atualizada');
      setMetaAutoAssets(false);
      if (target) {
        setMetaIntegration(target);
        setMetaDialogOpen(true);
      }
    } else if (target) {
      setMetaIntegration(target);
      setMetaDialogOpen(true);
    }

    const next = new URLSearchParams(searchParams);
    next.delete('meta');
    next.delete('integration_id');
    next.delete('reason');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, integrations, metaConnection, isLoading]);

  const handleConnect = (definition: IntegrationProviderDefinition) => {
    setSelectedDefinition(definition);
    setSelectedIntegration(null);
    setDialogOpen(true);
  };

  const handleManage = (integration: Integration) => {
    if (integration.provider === 'meta') {
      setMetaIntegration(integration);
      setMetaAutoAssets(false);
      setMetaDialogOpen(true);
      return;
    }
    setSelectedDefinition(null);
    setSelectedIntegration(integration);
    setDialogOpen(true);
  };

  if (permissionsLoading) {
    return (
      <>
        <Header title="Central de Integrações" subtitle="Conexões desta clínica" />
        <Skeleton className="h-64" />
      </>
    );
  }

  if (!canView) return <Navigate to="/app" replace />;

  return (
    <>
      <Header
        title="Central de Integrações"
        subtitle="Conexões, automações e credenciais isoladas por clínica"
      />

      <Card className="mb-4 border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-2 p-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            Cada conexão é isolada por clínica. Tokens da Meta ficam só no servidor
            (service role) — o navegador vê apenas status e ids públicos. A API Universal
            de Leads e os webhooks existentes continuam disponíveis nas outras abas.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="conexoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="conexoes">Conexões</TabsTrigger>
          <TabsTrigger value="leads">API de Leads</TabsTrigger>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="tokens">Tokens de API</TabsTrigger>
        </TabsList>

        <TabsContent value="conexoes" className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Plug className="h-4 w-4" />
                  Conta Meta
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MetaCard
                    connection={metaConnection}
                    canCreate={canCreate}
                    canEdit={canEdit}
                    onManage={handleManage}
                  />
                </div>
              </section>

              {CATEGORY_ORDER.map((category) => {
                const definitions = catalogProviders.filter((p) => p.category === category);
                if (definitions.length === 0) return null;

                return (
                  <section key={category} className="space-y-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <Plug className="h-4 w-4" />
                      {INTEGRATION_CATEGORY_LABELS[category]}
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {definitions.map((definition) => (
                        <IntegrationCard
                          key={definition.id}
                          definition={definition}
                          connections={byProvider.get(definition.id) || []}
                          canCreate={canCreate}
                          canEdit={canEdit}
                          onConnect={handleConnect}
                          onManage={handleManage}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </TabsContent>

        <TabsContent value="leads">
          <LeadsApiPanel />
        </TabsContent>

        <TabsContent value="automacoes">
          <AutomationFlowsPanel
            integrations={integrations}
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        </TabsContent>

        <TabsContent value="logs">
          <IntegrationLogsPanel />
        </TabsContent>

        <TabsContent value="tokens">
          <ApiTokensPanel canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
      </Tabs>

      <IntegrationFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        definition={selectedDefinition}
        integration={selectedIntegration}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      <MetaConnectionDialog
        open={metaDialogOpen}
        onOpenChange={setMetaDialogOpen}
        integration={metaIntegration || metaConnection}
        canEdit={canEdit}
        autoOpenAssets={metaAutoAssets}
      />
    </>
  );
}
