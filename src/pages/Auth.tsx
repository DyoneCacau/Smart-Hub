import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  'User already registered': 'Este e-mail já está cadastrado. Use a aba Entrar.',
};

const PASSWORD_RULES = [
  { id: 'length', label: 'Pelo menos 8 caracteres', test: (v: string) => v.length >= 8 },
  { id: 'upper', label: 'Uma letra maiúscula', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'Uma letra minúscula', test: (v: string) => /[a-z]/.test(v) },
  { id: 'number', label: 'Um número', test: (v: string) => /\d/.test(v) },
];

function authErrorMessage(error: Error): string {
  if (AUTH_ERROR_MESSAGES[error.message]) return AUTH_ERROR_MESSAGES[error.message];
  if (/password/i.test(error.message)) return 'A senha não atende aos requisitos de segurança.';
  if (/rate limit/i.test(error.message)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  return 'Não foi possível concluir. Verifique os dados e tente novamente.';
}

export default function Auth() {
  const { user, isLoading, signIn, signUp } = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [confirmEmailFor, setConfirmEmailFor] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const from = (location.state as { from?: string } | null)?.from || '/';
  if (!isSupabaseConfigured) return <Navigate to="/" replace />;
  if (!isLoading && user) return <Navigate to={from} replace />;

  const passwordChecks = PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(password) }));
  const passwordStrong = passwordChecks.every((rule) => rule.ok);
  const passwordsMatch = password === passwordConfirm;
  const showMismatch = passwordConfirm.length > 0 && !passwordsMatch;
  const canSignUp = name.trim().length > 0 && email.trim().length > 0 && passwordStrong && passwordsMatch;

  const handleTabChange = () => {
    setPassword('');
    setPasswordConfirm('');
  };

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { error } = await signIn(email.trim().toLowerCase(), password);
    setBusy(false);
    if (error) toast.error(authErrorMessage(error));
  };

  const handleSignUp = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordStrong) {
      toast.error('A senha não atende aos requisitos de segurança.');
      return;
    }
    if (!passwordsMatch) {
      toast.error('As senhas não coincidem.');
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    setBusy(true);
    const { error } = await signUp(normalizedEmail, password, name.trim());
    setBusy(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    setPassword('');
    setPasswordConfirm('');
    // Com confirmação de e-mail ativa no Supabase não há sessão até o usuário clicar no link.
    setConfirmEmailFor(normalizedEmail);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <img src="/logo-192.png" alt="" className="mb-2 h-20 w-20" width={80} height={80} />
          <CardTitle className="text-2xl">SmartHub</CardTitle>
          <CardDescription>Agenda, cadastros e Smart Hub da sua clínica</CardDescription>
        </CardHeader>
        <CardContent>
          {confirmEmailFor ? (
            <div className="space-y-4 text-center text-sm">
              <p>
                Enviamos um link de confirmação para <strong>{confirmEmailFor}</strong>. Abra o e-mail, confirme o
                cadastro e depois entre com sua senha.
              </p>
              <Button variant="outline" onClick={() => setConfirmEmailFor(null)}>
                Voltar para o login
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="signin" onValueChange={handleTabChange}>
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form className="space-y-4" onSubmit={(e) => void handleSignIn(e)}>
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">E-mail</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Senha</Label>
                    <PasswordInput
                      id="signin-password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? 'Entrando…' : 'Entrar'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form className="space-y-4" onSubmit={(e) => void handleSignUp(e)}>
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Seu nome</Label>
                    <Input
                      id="signup-name"
                      autoComplete="name"
                      required
                      maxLength={120}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha</Label>
                    <PasswordInput
                      id="signup-password"
                      autoComplete="new-password"
                      required
                      aria-describedby="signup-password-rules"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <ul id="signup-password-rules" className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-xs">
                      {passwordChecks.map((rule) => (
                        <li
                          key={rule.id}
                          className={cn(
                            'flex items-center gap-1.5',
                            rule.ok ? 'text-emerald-600' : 'text-muted-foreground'
                          )}
                        >
                          {rule.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          {rule.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password-confirm">Confirmar senha</Label>
                    <PasswordInput
                      id="signup-password-confirm"
                      autoComplete="new-password"
                      required
                      aria-invalid={showMismatch}
                      aria-describedby="signup-password-confirm-hint"
                      className={cn(showMismatch && 'border-destructive focus-visible:ring-destructive')}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      onPaste={(e) => e.preventDefault()}
                    />
                    <p
                      id="signup-password-confirm-hint"
                      className={cn(
                        'text-xs',
                        showMismatch
                          ? 'text-destructive'
                          : passwordConfirm && passwordsMatch
                            ? 'text-emerald-600'
                            : 'text-muted-foreground'
                      )}
                    >
                      {showMismatch
                        ? 'As senhas não coincidem.'
                        : passwordConfirm && passwordsMatch
                          ? 'As senhas coincidem.'
                          : 'Digite a mesma senha novamente.'}
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={busy || !canSignUp}>
                    {busy ? 'Criando conta…' : 'Criar conta'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
