import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { KeyRound, Plus, ShieldOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { DateInput } from '@/components/ui/date-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SecretRevealField } from './SecretRevealField';
import { API_TOKEN_SCOPES } from '@/lib/integrationProviders';
import { maskToken } from '@/lib/integrationSecurity';
import { useApiTokens, useApiTokenMutations } from '@/hooks/useApiTokens';
import type { ApiTokenScope } from '@/types/integration';

interface ApiTokensPanelProps {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

function timestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : format(date, 'dd/MM/yyyy HH:mm');
}

export function ApiTokensPanel({ canCreate, canEdit, canDelete }: ApiTokensPanelProps) {
  const { tokens, isLoading } = useApiTokens();
  const { createToken, revokeToken, deleteToken } = useApiTokenMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [scopes, setScopes] = useState<ApiTokenScope[]>([]);
  const [plainToken, setPlainToken] = useState<string | null>(null);

  useEffect(() => {
    if (dialogOpen) return;
    setName('');
    setExpiresAt('');
    setScopes([]);
    setPlainToken(null);
  }, [dialogOpen]);

  const toggleScope = (scope: ApiTokenScope, checked: boolean) => {
    setScopes((prev) => (checked ? [...prev, scope] : prev.filter((s) => s !== scope)));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Informe um nome para o token');
      return;
    }
    if (scopes.length === 0) {
      toast.error('Selecione pelo menos um escopo');
      return;
    }

    const created = await createToken.mutateAsync({
      name: name.trim(),
      scopes,
      expires_at: expiresAt || null,
    });
    setPlainToken(created.plainToken);
  };

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              Tokens de API
            </h3>
            <p className="text-sm text-muted-foreground">
              Credenciais para n8n, Make, Zapier e sistemas parceiros. Valem só para esta clínica.
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => setDialogOpen(true)} disabled={!canCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Gerar token
          </Button>
        </div>

        {tokens.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum token gerado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Escopos</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {maskToken(token.token_prefix)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {token.scopes.length === 0 ? '—' : token.scopes.join(', ')}
                    </TableCell>
                    <TableCell className="text-sm">{timestamp(token.last_used_at)}</TableCell>
                    <TableCell className="text-sm">{timestamp(token.expires_at)}</TableCell>
                    <TableCell>
                      <Badge variant={token.status === 'active' ? 'default' : 'secondary'}>
                        {token.status === 'active' ? 'Ativo' : 'Revogado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && token.status === 'active' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => revokeToken.mutate(token.id)}
                          aria-label={`Revogar ${token.name}`}
                        >
                          <ShieldOff className="h-4 w-4 text-amber-600" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteToken.mutate(token.id)}
                          aria-label={`Excluir ${token.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar token de API</DialogTitle>
            <DialogDescription>
              O token aparece uma única vez. No banco ficam apenas o prefixo e o hash.
            </DialogDescription>
          </DialogHeader>

          {plainToken ? (
            <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-3">
              <p className="text-xs font-medium text-emerald-900">
                Copie agora — este valor não será exibido novamente.
              </p>
              <SecretRevealField
                label="Token"
                value={plainToken}
                helpText="Use no header: Authorization: Bearer <token>"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="token-name">Nome</Label>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: n8n - fluxo de leads"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="token-expires">Expira em (opcional)</Label>
                <DateInput id="token-expires" value={expiresAt} onChange={setExpiresAt} />
              </div>

              <div className="space-y-2">
                <Label>Escopos</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {API_TOKEN_SCOPES.map((scope) => (
                    <div key={scope.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`scope-${scope.id}`}
                        checked={scopes.includes(scope.id)}
                        onCheckedChange={(checked) => toggleScope(scope.id, checked === true)}
                      />
                      <label htmlFor={`scope-${scope.id}`} className="cursor-pointer text-sm">
                        {scope.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Fechar
            </Button>
            {!plainToken && (
              <Button type="button" onClick={handleCreate} disabled={createToken.isPending}>
                Gerar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
