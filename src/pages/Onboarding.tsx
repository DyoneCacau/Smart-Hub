import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SEGMENT_PRESETS, type BusinessSegment } from '@/lib/segmentPresets';
import { WORKSPACE_OBJECTIVES, getObjectiveStages, type WorkspaceObjective } from '@/lib/workspaceObjectives';
import { getCapturePresetForSegment } from '@/lib/captureFormPresets';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';

const DEFAULT_OBJECTIVE: Record<BusinessSegment, WorkspaceObjective> = {
  products: 'sales',
  services: 'quotes',
  real_estate: 'bookings',
  education: 'enrollments',
  health_wellness: 'bookings',
  hospitality: 'bookings',
  b2b: 'b2b_prospecting',
  other: 'lead_capture',
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { setWorkspaceId } = useWorkspace();
  const [name, setName] = useState('');
  const [segment, setSegment] = useState<BusinessSegment>('services');
  const [objective, setObjective] = useState<WorkspaceObjective>('quotes');
  const [saving, setSaving] = useState(false);

  const preset = useMemo(() => SEGMENT_PRESETS.find((item) => item.id === segment)!, [segment]);
  const initialStages = useMemo(() => getObjectiveStages(segment, objective, preset.defaultStages), [segment, objective, preset.defaultStages]);

  const chooseSegment = (next: BusinessSegment) => {
    setSegment(next);
    setObjective(DEFAULT_OBJECTIVE[next]);
  };

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
          objective,
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

      const stages = initialStages.map((label, index) => ({
        workspace_id: workspace.id,
        name: label,
        position: index,
        is_won: ['Venda', 'Fechado', 'Matrícula', 'Confirmado', 'Convertido', 'Resolvido'].includes(label),
        is_lost: label === 'Perdido',
      }));

      const { error: stageError } = await (supabase as any).from('funnel_stages').insert(stages);
      if (stageError) throw stageError;

      const capturePreset = getCapturePresetForSegment(segment);
      await (supabase as any).from('capture_forms').insert({
        workspace_id: workspace.id,
        slug: `${workspace.id.slice(0, 8)}-${capturePreset.id}`,
        title: capturePreset.title,
        description: capturePreset.description,
        segment,
        objective,
        submit_label: capturePreset.submitLabel,
        fields: capturePreset.fields,
        source: 'direct',
        is_published: false,
        created_by: userData.user.id,
      });

      setWorkspaceId(workspace.id);
      toast.success('Workspace criado com funil e formulário inicial');
      navigate('/funil', { replace: true });
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível criar o workspace');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Configure sua operação</h1>
        <p className="text-muted-foreground">Segmento + objetivo definem apenas o ponto de partida. Depois, etapas, formulários, campos e automações continuam totalmente configuráveis.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>1. Empresa ou operação</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="workspace-name">Nome</Label>
          <Input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Minha Empresa" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Qual é o segmento?</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {SEGMENT_PRESETS.map((item) => (
            <button type="button" key={item.id} onClick={() => chooseSegment(item.id)} className={`rounded-lg border p-3 text-left transition ${segment === item.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
              <div className="font-medium">{item.label}</div>
              <div className="text-sm text-muted-foreground">{item.description}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. O que você quer acompanhar?</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {WORKSPACE_OBJECTIVES.map((item) => (
            <button type="button" key={item.id} onClick={() => setObjective(item.id)} className={`rounded-lg border p-3 text-left transition ${objective === item.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
              <div className="font-medium">{item.label}</div>
              <div className="text-sm text-muted-foreground">{item.description}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>4. Funil inicial sugerido</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {initialStages.map((stage) => <span key={stage} className="rounded-full border px-3 py-1 text-sm">{stage}</span>)}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Esse modelo é só uma sugestão inicial. O workspace continua horizontal e pode ser adaptado ao processo real do negócio.</p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleCreate} disabled={saving}>{saving ? 'Criando...' : 'Criar workspace'}</Button>
      </div>
    </div>
  );
}
