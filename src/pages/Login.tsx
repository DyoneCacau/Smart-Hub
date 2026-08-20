import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function Login() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/funil" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const result = mode === 'signin'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, name.trim());

      if (result.error) throw result.error;

      if (mode === 'signup') {
        toast.success('Cadastro realizado. Confirme seu e-mail se solicitado.');
      }

      const from = (location.state as { from?: string } | null)?.from;
      navigate(from || '/funil', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível entrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === 'signin' ? 'Entrar na plataforma' : 'Criar sua conta'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? 'Aguarde...' : mode === 'signin' ? 'Entrar' : 'Criar conta'}
            </Button>
            <Button
              className="w-full"
              type="button"
              variant="ghost"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? 'Ainda não tenho conta' : 'Já tenho conta'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
