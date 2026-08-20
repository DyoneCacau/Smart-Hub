
interface MarketingPlaceholderProps {
  title: string;
  description: string;
}

function MarketingPlaceholder({ title, description }: MarketingPlaceholderProps) {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        Módulo em preparação. A arquitetura do Marketing foi reservada para as próximas fases.
      </div>
    </>
  );
}

export function MarketingCrm() {
  return (
    <MarketingPlaceholder
      title="CRM"
      description="Gestão de leads e funil de conversão."
    />
  );
}

export function MarketingCampaigns() {
  return (
    <MarketingPlaceholder
      title="Campanhas"
      description="Campanhas de marketing e UTM."
    />
  );
}

export function MarketingLandingPages() {
  return (
    <MarketingPlaceholder
      title="Landing Pages"
      description="Landing pages de conversão."
    />
  );
}

export function MarketingAnalytics() {
  return (
    <MarketingPlaceholder
      title="Analytics"
      description="Visão consolidada de marketing."
    />
  );
}
