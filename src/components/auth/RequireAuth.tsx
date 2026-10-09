import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useMyClinic } from '@/hooks/useMyClinic';
import { isSupabaseConfigured } from '@/integrations/supabase/client';

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">
      <div className="max-w-md space-y-4">{children}</div>
    </div>
  );
}

/** Exige login (quando há Supabase) e espera a clínica do usuário carregar antes das telas internas. */
export function RequireAuth() {
  const { user, isLoading, signOut } = useAuth();
  const { isLoading: clinicLoading, error } = useMyClinic();
  const location = useLocation();

  if (!isSupabaseConfigured) return <Outlet />;
  if (isLoading) return <FullScreenMessage>Carregando…</FullScreenMessage>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (clinicLoading) return <FullScreenMessage>Carregando sua clínica…</FullScreenMessage>;
  if (error) {
    return (
      <FullScreenMessage>
        <p className="font-medium text-foreground">Não foi possível carregar sua clínica.</p>
        <p>
          Confira se o arquivo <code>supabase/SETUP_NOVO_PROJETO.sql</code> foi executado no SQL Editor do Supabase e
          recarregue a página.
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
          <Button variant="outline" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </FullScreenMessage>
    );
  }
  return <Outlet />;
}
