import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import PublicSmartHub from "@/pages/smart-hub/PublicSmartHub";
import SmartHubDashboard from "@/pages/smart-hub/SmartHubDashboard";
import SmartHubEditor from "@/pages/smart-hub/SmartHubEditor";
import SmartHubTemplates from "@/pages/smart-hub/SmartHubTemplates";
import SmartHubButtons from "@/pages/smart-hub/SmartHubButtons";
import SmartHubAnalytics from "@/pages/smart-hub/SmartHubAnalytics";
import SmartHubSettings from "@/pages/smart-hub/SmartHubSettings";
import SmartHubDomain from "@/pages/smart-hub/SmartHubDomain";
import SmartHubPreview from "@/pages/smart-hub/SmartHubPreview";
import { AuthProvider } from "@/hooks/useAuth";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/smart-hub" replace />} />
            <Route path="/hub/:slug" element={<PublicSmartHub />} />
            <Route path="/smart-hub" element={<SmartHubDashboard />} />
            <Route path="/smart-hub/previa" element={<SmartHubPreview />} />
            <Route path="/smart-hub/paginas" element={<SmartHubEditor />} />
            <Route path="/smart-hub/templates" element={<SmartHubTemplates />} />
            <Route path="/smart-hub/botoes" element={<SmartHubButtons />} />
            <Route path="/smart-hub/analytics" element={<SmartHubAnalytics />} />
            <Route path="/smart-hub/configuracoes" element={<SmartHubSettings />} />
            <Route path="/smart-hub/dominio" element={<SmartHubDomain />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
