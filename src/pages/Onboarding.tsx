import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SEGMENT_PRESETS, type BusinessSegment } from '@/lib/segmentPresets';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';

export default function Onboarding() {
  const navigate = useNavigate();
  const { setWorkspaceId } = useWorkspace();
  const [name, setName] = useState('');
  const [segment, setSegment] = useState<BusinessSegment>('services');
  const [saving, setSaving] = useState(false);

  const preset = useMemo(
    () => SEGMENT_PRESETS.find((item) => item.id === segment)!,
    [segment],
  );

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Informe o nome da empresa ou operação');
      return;
    }

    setSaving(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError || new Error('Usuário não autenticado');

      const { data: workspace, error: workspaceError } = await (supabase as any)
        .from('workspaces')
        .insert({
          name: name.trim(),
          segment,
          entity_label: preset.entityLabel,
          conversion_label: preset.conversionLabel,
          created_by: userData.user.id,
        })
        .select('id')
        .single();
      if (workspaceError) throw workspaceError;

      const { error: memberError } = await (supabase as any).from('workspace_users').insert({
        workspace_id: workspace.id,
        user_id: userData.user.id,
        role: 'owner',
      });
      if (memberError) throw memberError;

      const stages = preset.defaultStages.map((label, index) => ({
        workspace_id: workspace.id,
        name: label,
        position: index,
        is_won: ['Venda', 'Fechado', 'Matrícula', 'Confirmado', 'Convertido'].includes(label),
        is_lost: label === 'Perdido',
      }));

      const { error: stageError } = await (supabase as any).from('funnel_stages').insert(stages);
      if (stageError) throw stageError;

      setWorkspaceId(workspace.id);
      toast.success('Workspace criado');
      navigate('/funil', { replace: true });
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível criar o workspace');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Configure sua operação</h1>
        <p className="text-muted-foreground">
          O segmento personaliza nomenclaturas e etapas iniciais, mas todos usam o mesmo CRM, tracking e motor de integrações.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Empresa ou operação</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="workspace-name">Nome</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Prime Service"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Como você vende?</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {SEGMENT_PRESETS.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setSegment(item.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  segment === item.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <div className="font-medium">{item.label}</div>
                <div className="text-sm text-muted-foreground">{item.description}</div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Funil inicial</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {preset.defaultStages.map((stage) => (
              <span key={stage} className="rounded-full border px-3 py-1 text-sm">{stage}</span>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Você poderá renomear, adicionar, remover e reordenar etapas depois.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleCreate} disabled={saving}>
          {saving ? 'Criando...' : 'Criar workspace'}
        </Button>
      </div>
    </div>
  );
}
