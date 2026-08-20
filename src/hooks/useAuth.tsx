import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

type AppRole = 'admin' | 'receptionist' | 'seller' | 'professional' | 'superadmin';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── SECURITY: Superadmin is determined ONLY by database role ───
// Never use client-side email lists — they expose superadmin identity
// in the browser bundle and can be bypassed. The DB role is the single
// source of truth, enforced by RLS on the server.
const SUPERADMIN_EMAILS: string[] = [];

const logAuthError = (operation: string, error: unknown) => {
  const safeError = error && typeof error === 'object'
    ? {
        name: 'name' in error ? String(error.name) : 'Error',
        code: 'code' in error ? String(error.code) : undefined,
      }
    : { name: 'Error' };
  console.error(`[useAuth] ${operation} falhou.`, safeError);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) throw profileError;
      if (profileData) {
        setProfile(profileData as Profile);
      } else {
        setProfile(null);
      }

      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (rolesError) throw rolesError;
      // SECURITY: Role determined exclusively by database — no client-side bypass
      const rolesFromDb = rolesData ? rolesData.map(r => r.role as AppRole) : [];
      setRoles(rolesFromDb);
    } catch (error) {
      setProfile(null);
      setRoles([]);
      logAuthError('Busca de perfil e permissões', error);
    }
  };

  // Modelo vendas diretas: clínicas e usuários são criados pelo superadmin.
  // Não criar clínica automaticamente no login; usuário sem clínica deve contatar o suporte.

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setRoles([]);
        }
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) throw error;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void fetchProfile(session.user.id);
      }
      setIsLoading(false);
    }).catch((error) => {
      logAuthError('Restauração da sessão', error);
      setIsLoading(false);
    });

    // Fallback: se getSession nunca resolver (rede/offline), libera a tela após 5s
    const timeout = setTimeout(() => setIsLoading(false), 5000);
    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name },
      },
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      logAuthError('Saída da sessão', error);
      throw error;
    }
    setProfile(null);
    setRoles([]);
  };

  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  const isSuperAdmin = roles.includes('superadmin');

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        isAdmin,
        isSuperAdmin,
        isLoading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
