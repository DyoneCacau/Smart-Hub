import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Auth from "@/pages/Auth";
import Agenda from "@/pages/scheduling/Agenda";
import ClinicSettings from "@/pages/scheduling/ClinicSettings";
import Patients from "@/pages/scheduling/Patients";
import Professionals from "@/pages/scheduling/Professionals";
import Procedures from "@/pages/scheduling/Procedures";
import PublicSmartHub from "@/pages/smart-hub/PublicSmartHub";
import SmartHubDashboard from "@/pages/smart-hub/SmartHubDashboard";
import SmartHubEditor from "@/pages/smart-hub/SmartHubEditor";
import SmartHubTemplates from "@/pages/smart-hub/SmartHubTemplates";
import SmartHubButtons from "@/pages/smart-hub/SmartHubButtons";
import SmartHubAnalytics from "@/pages/smart-hub/SmartHubAnalytics";
import SmartHubSettings from "@/pages/smart-hub/SmartHubSettings";
import SmartHubDomain from "@/pages/smart-hub/SmartHubDomain";
import SmartHubPreview from "@/pages/smart-hub/SmartHubPreview";
import Crm from "@/pages/Crm";
import Integrations from "@/pages/Integrations";
import WhatsAppSuri from "@/pages/WhatsAppSuri";
import { MarketingCrm, MarketingCampaigns, MarketingLandingPages, MarketingAnalytics } from "@/pages/marketing/MarketingPlaceholders";
import { AuthProvider } from "@/hooks/useAuth";
import { useClinicSettings } from "@/hooks/useClinicSettings";

const queryClient = new QueryClient();

function Home() {
  const { isConfigured } = useClinicSettings();
  return <Navigate to={isConfigured ? "/agenda" : "/configuracoes"} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Auth />} />
            <Route path="/hub/:slug" element={<PublicSmartHub />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<Home />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/pacientes" element={<Patients />} />
              <Route path="/profissionais" element={<Professionals />} />
              <Route path="/procedimentos" element={<Procedures />} />
              <Route path="/configuracoes" element={<ClinicSettings />} />
              <Route path="/dashboard" element={<Navigate to="/smart-hub/dashboard" replace />} />
              <Route path="/smart-hub" element={<Navigate to="/smart-hub/dashboard" replace />} />
              <Route path="/smart-hub/dashboard" element={<SmartHubDashboard />} />
              <Route path="/smart-hub/previa" element={<SmartHubPreview />} />
              <Route path="/smart-hub/paginas" element={<SmartHubEditor />} />
              <Route path="/smart-hub/templates" element={<SmartHubTemplates />} />
              <Route path="/smart-hub/botoes" element={<SmartHubButtons />} />
              <Route path="/smart-hub/analytics" element={<SmartHubAnalytics />} />
              <Route path="/smart-hub/configuracoes" element={<SmartHubSettings />} />
              <Route path="/smart-hub/dominio" element={<SmartHubDomain />} />
              <Route path="/crm" element={<Crm />} />
              <Route path="/integracoes" element={<Integrations />} />
              <Route path="/whatsapp" element={<WhatsAppSuri />} />
              <Route path="/marketing/crm" element={<MarketingCrm />} />
              <Route path="/marketing/campanhas" element={<MarketingCampaigns />} />
              <Route path="/marketing/landing-pages" element={<MarketingLandingPages />} />
              <Route path="/marketing/analytics" element={<MarketingAnalytics />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
