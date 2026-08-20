import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertCircle,
  CalendarPlus,
  KanbanSquare,
  MessageCircle,
  Phone,
  Plus,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DateInput } from '@/components/ui/date-input';
import { LeadSourceBadge, LeadSourceLabel } from '@/components/crm/LeadSourceBadge';
import { CrmLeadQuickActions } from '@/components/crm/CrmLeadQuickActions';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { useCrmLeads, useCrmLeadMutations } from '@/hooks/useCrmLeads';
import { useClinicStaffOptions } from '@/hooks/useClinicStaffOptions';
import { usePatientMutations } from '@/hooks/usePatients';
import { useClinic } from '@/hooks/useClinic';
import { formatCurrencyBRL } from '@/lib/currency';
import { leadSourceLabels, type LeadSource } from '@/types/agenda';
import {
  CRM_STAGES,
  type CrmLead,
  type CrmLeadStage,
} from '@/types/crm';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const emptyForm = {
  name: '',
  cpf: '',
  phone: '',
  email: '',
  stage: 'new' as CrmLeadStage,
  lead_source: '' as '' | LeadSource,
  referral_name: '',
  interest: '',
  estimated_value: 0,
  next_follow_up: '',
  notes: '',
  allergies: [] as string[],
  owner_user_id: '',
  lost_reason: '',
};

const formatCPF = (value: string) => {
  const numbers = value.replace(/\D/g, '');
  return numbers
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .slice(0, 14);
};

export default function Crm() {
  const navigate = useNavigate();
  const { can, isLoading: permLoading } = usePermissions();
  const { user } = useAuth();
  const { data: leads = [], isLoading, error } = useCrmLeads();
  const { createLead, updateLead, moveLeadStage, deleteLead } = useCrmLeadMutations();
  const { createPatient } = usePatientMutations();
  const { staff } = useClinicStaffOptions();
  const { clinic } = useClinic();

  const canView = can('crm', 'can_view');
  const canCreate = can('crm', 'can_create');
  const canEdit = can('crm', 'can_edit');
  const canDelete = can('crm', 'can_delete');

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmLead | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [newAllergy, setNewAllergy] = useState('');
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CrmLeadStage | null>(null);
  const [formError, setFormError] = useState('');
  const [whatsappLeadMode, setWhatsappLeadMode] = useState(false);

  const today = startOfDay(new Date());

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((lead) => {
      const hay = `${lead.name} ${lead.phone || ''} ${lead.interest || ''} ${lead.ownerName || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [leads, search]);

  const byStage = useMemo(() => {
    const map: Record<CrmLeadStage, CrmLead[]> = {
      new: [],
      contact: [],
      scheduled: [],
      won: [],
      lost: [],
    };
    filtered.forEach((lead) => {
      map[lead.stage]?.push(lead);
    });
    return map;
  }, [filtered]);

  const overdueCount = filtered.filter(
    (l) =>
      l.nextFollowUp &&
      !['won', 'lost'].includes(l.stage) &&
      isBefore(parseISO(l.nextFollowUp), today),
  ).length;

  const openCreate = () => {
    setEditing(null);
    setFormError('');
    setWhatsappLeadMode(false);
    setForm({
      ...emptyForm,
      owner_user_id: user?.id || '',
    });
    setNewAllergy('');
    setDialogOpen(true);
  };

  const openWhatsAppLead = () => {
    setEditing(null);
    setFormError('');
    setWhatsappLeadMode(true);
    setForm({
      ...emptyForm,
      lead_source: 'smart_hub',
      stage: 'new',
      owner_user_id: user?.id || '',
      notes: 'Cadastro manual a partir de atendimento WhatsApp (Smart Hub).',
    });
    setNewAllergy('');
    setDialogOpen(true);
  };

  const handleAddAllergy = () => {
    const value = newAllergy.trim();
    if (value && !form.allergies.includes(value)) {
      setForm((prev) => ({ ...prev, allergies: [...prev.allergies, value] }));
      setNewAllergy('');
    }
  };

  const handleRemoveAllergy = (allergy: string) => {
    setForm((prev) => ({ ...prev, allergies: prev.allergies.filter((a) => a !== allergy) }));
  };

  const openEdit = (lead: CrmLead) => {
    setEditing(lead);
    setFormError('');
    setWhatsappLeadMode(false);
    setForm({
      name: lead.name,
      cpf: lead.cpf ? formatCPF(lead.cpf) : '',
      phone: lead.phone || '',
      email: lead.email || '',
      stage: lead.stage,
      lead_source: lead.leadSource || '',
      referral_name: lead.referralName || '',
      interest: lead.interest || '',
      estimated_value: lead.estimatedValue || 0,
      next_follow_up: lead.nextFollowUp || '',
      notes: lead.notes || '',
      allergies: lead.allergies || [],
      owner_user_id: lead.ownerUserId || '',
      lost_reason: lead.lostReason || '',
    });
    setNewAllergy('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.lead_source) {
      setFormError('Preencha nome, telefone e origem do lead.');
      return;
    }
    setFormError('');
    const payload = {
      name: form.name.trim(),
      cpf: form.cpf.replace(/\D/g, '') ? form.cpf.trim() : null,
      phone: form.phone.trim(),
      email: form.email || null,
      stage: form.stage,
      lead_source: form.lead_source,
      referral_name: form.referral_name || null,
      interest: form.interest || null,
      estimated_value: form.estimated_value > 0 ? form.estimated_value : null,
      next_follow_up: form.next_follow_up || null,
      notes: form.notes || null,
      allergies: form.allergies,
      owner_user_id: form.owner_user_id || user?.id || null,
      lost_reason: form.stage === 'lost' ? form.lost_reason || null : null,
    };

    if (editing) {
      await updateLead.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createLead.mutateAsync(payload);
    }
    setDialogOpen(false);
  };

  /** Cria paciente (se preciso) e abre Agenda com origem/interesse do CRM */
  const handleScheduleFromLead = async (lead: CrmLead) => {
    setConvertingId(lead.id);
    try {
      let patientId = lead.patientId;
      if (!patientId) {
        const created = await createPatient.mutateAsync({
          name: lead.name,
          cpf: lead.cpf || null,
          phone: lead.phone,
          email: lead.email,
          address: null,
          birth_date: null,
          clinical_notes: [
            lead.interest ? `Interesse: ${lead.interest}` : null,
            lead.notes || null,
          ]
            .filter(Boolean)
            .join('\n') || null,
          allergies: lead.allergies || [],
          lead_source: lead.leadSource || null,
          referral_name: lead.referralName || null,
          status: 'active',
        });
        patientId = created.id;
        await updateLead.mutateAsync({
          id: lead.id,
          patient_id: patientId,
        });
      }

      const params = new URLSearchParams({
        fromCrm: '1',
        patientId,
        crmLeadId: lead.id,
        crmTargetStage: lead.stage === 'won' ? 'won' : 'scheduled',
      });
      if (lead.interest) params.set('procedure', lead.interest);
      if (lead.leadSource) params.set('leadSource', lead.leadSource);
      if (lead.referralName) params.set('referralName', lead.referralName);
      if (lead.ownerUserId) params.set('sellerId', lead.ownerUserId);
      if (lead.notes) params.set('notes', lead.notes.slice(0, 400));

      setDialogOpen(false);
      navigate(`/agenda?${params.toString()}`);
      toast.success('Abrindo agenda com dados do lead');
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível criar o paciente / abrir a agenda');
    } finally {
      setConvertingId(null);
    }
  };

  if (permLoading || isLoading) {
    return (
      <>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (!canView) {
    return (
      <>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Você não tem permissão para ver o CRM.
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <KanbanSquare className="h-6 w-6" />
              CRM de Vendas
            </h1>
            <p className="text-sm text-muted-foreground">
              Pipeline de leads: contato, follow-up e conversão — separado da Agenda e do Caixa
            </p>
          </div>
          {canCreate && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Novo lead
              </Button>
              <Button variant="outline" onClick={openWhatsAppLead}>
                <MessageCircle className="mr-2 h-4 w-4 text-emerald-600" />
                Adicionar lead do WhatsApp
              </Button>
            </div>
          )}
        </div>

        {error && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex gap-3 py-4 text-sm text-amber-900">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                Não foi possível carregar os leads. Se ainda não rodou o SQL, execute
                {' '}<code className="font-mono">supabase/PRODUCAO_14_CRM_LEADS.sql</code> no painel.
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome, telefone, interesse ou responsável"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="w-fit">
              {overdueCount} follow-up atrasado{overdueCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-5 md:grid-cols-2 lg:grid-cols-3">
          {CRM_STAGES.map((stage) => (
            <Card
              key={stage.id}
              className={cn(
                'border transition-shadow',
                stage.tone,
                dragOverStage === stage.id && 'ring-2 ring-primary shadow-md',
              )}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverStage(stage.id);
              }}
              onDragLeave={() => {
                setDragOverStage((current) => (current === stage.id ? null : current));
              }}
              onDrop={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                const leadId = e.dataTransfer.getData('text/crm-lead-id');
                setDragOverStage(null);
                setDragLeadId(null);
                if (!leadId) return;
                const lead = leads.find((l) => l.id === leadId);
                if (!lead || lead.stage === stage.id) return;
                moveLeadStage.mutate({ id: leadId, stage: stage.id });
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between gap-2">
                  <span>{stage.label}</span>
                  <Badge variant="secondary">{byStage[stage.id].length}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">{stage.description}</p>
              </CardHeader>
              <CardContent className="space-y-2 min-h-[120px] max-h-[60vh] overflow-y-auto">
                {byStage[stage.id].length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    {dragOverStage === stage.id ? 'Solte aqui' : 'Nenhum lead'}
                  </p>
                ) : (
                  byStage[stage.id].map((lead) => {
                    const overdue =
                      lead.nextFollowUp &&
                      !['won', 'lost'].includes(lead.stage) &&
                      isBefore(parseISO(lead.nextFollowUp), today);
                    return (
                      <div
                        key={lead.id}
                        draggable={canEdit}
                        onDragStart={(e) => {
                          if (!canEdit) return;
                          e.dataTransfer.setData('text/crm-lead-id', lead.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragLeadId(lead.id);
                        }}
                        onDragEnd={() => {
                          setDragLeadId(null);
                          setDragOverStage(null);
                        }}
                        onClick={() => canEdit && openEdit(lead)}
                        className={cn(
                          'w-full rounded-lg border bg-background p-3 text-left transition hover:shadow-sm',
                          canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                          dragLeadId === lead.id && 'opacity-50',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm leading-tight">{lead.name}</p>
                          {lead.estimatedValue != null && lead.estimatedValue > 0 && (
                            <span className="text-xs font-semibold text-emerald-700 shrink-0">
                              R$ {formatCurrencyBRL(lead.estimatedValue)}
                            </span>
                          )}
                        </div>
                        {lead.interest && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{lead.interest}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {lead.leadSource && (
                            <LeadSourceBadge source={lead.leadSource} />
                          )}
                          {overdue && (
                            <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>
                          )}
                        </div>
                        <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                          {lead.phone && (
                            <p className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </p>
                          )}
                          {lead.ownerName && (
                            <p className="flex items-center gap-1">
                              <UserRound className="h-3 w-3" />
                              {lead.ownerName}
                            </p>
                          )}
                          {lead.nextFollowUp && (
                            <p>
                              Follow-up:{' '}
                              {format(parseISO(lead.nextFollowUp), "d MMM", { locale: ptBR })}
                            </p>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-1">
                          <CrmLeadQuickActions
                            lead={lead}
                            clinicName={clinic?.name || 'clínica'}
                            userName={user?.user_metadata?.name || user?.email || 'equipe'}
                            canEdit={canEdit}
                            afterContactStage="contact"
                            onEdit={() => openEdit(lead)}
                            onMoved={(stage) =>
                              moveLeadStage.mutate({ id: lead.id, stage })
                            }
                          />
                        </div>
                        {canEdit && (
                          <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                            <Select
                              value={lead.stage}
                              onValueChange={(v) =>
                                moveLeadStage.mutate({ id: lead.id, stage: v as CrmLeadStage })
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CRM_STAGES.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {lead.stage !== 'lost' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-full text-xs"
                                disabled={convertingId === lead.id}
                                onClick={() => handleScheduleFromLead(lead)}
                              >
                                <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                                {lead.patientId ? 'Agendar' : 'Paciente + Agenda'}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? 'Editar lead'
                : whatsappLeadMode
                  ? 'Adicionar lead do WhatsApp'
                  : 'Novo lead'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome do lead"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Telefone *</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="opcional"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })}
                placeholder="000.000.000-00 (opcional)"
                maxLength={14}
              />
              <p className="text-xs text-muted-foreground">
                Se informado, vai automaticamente para o cadastro do paciente ao converter o lead.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Etapa</Label>
                <Select
                  value={form.stage}
                  onValueChange={(v) => setForm({ ...form, stage: v as CrmLeadStage })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CRM_STAGES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Origem *</Label>
                <Select
                  value={form.lead_source || undefined}
                  onValueChange={(v) => setForm({ ...form, lead_source: v as LeadSource })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(leadSourceLabels) as LeadSource[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        <LeadSourceLabel source={key} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            {form.lead_source === 'referral' && (
              <div className="space-y-2">
                <Label>Quem indicou</Label>
                <Input
                  value={form.referral_name}
                  onChange={(e) => setForm({ ...form, referral_name: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Interesse / procedimento</Label>
              <Input
                value={form.interest}
                onChange={(e) => setForm({ ...form, interest: e.target.value })}
                placeholder="Ex.: Implante, clareamento, avaliação"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor estimado</Label>
                <CurrencyInput
                  value={form.estimated_value}
                  onValueChange={(v) => setForm({ ...form, estimated_value: v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Próximo follow-up</Label>
                <DateInput
                  value={form.next_follow_up}
                  onChange={(v) => setForm({ ...form, next_follow_up: v })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select
                value={form.owner_user_id || 'none'}
                onValueChange={(v) => setForm({ ...form, owner_user_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.stage === 'lost' && (
              <div className="space-y-2">
                <Label>Motivo da perda</Label>
                <Input
                  value={form.lost_reason}
                  onChange={(e) => setForm({ ...form, lost_reason: e.target.value })}
                  placeholder="Ex.: preço, foi para concorrente"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Alergias</Label>
              <div className="flex gap-2">
                <Input
                  value={newAllergy}
                  onChange={(e) => setNewAllergy(e.target.value)}
                  placeholder="Digite uma alergia"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAllergy();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleAddAllergy}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {form.allergies.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {form.allergies.map((allergy) => (
                    <Badge
                      key={allergy}
                      variant="destructive"
                      className="flex items-center gap-1 cursor-pointer"
                      onClick={() => handleRemoveAllergy(allergy)}
                    >
                      {allergy}
                      <X className="h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Também vai automaticamente para o cadastro do paciente ao converter o lead.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
            {editing && canDelete && (
              <Button
                variant="destructive"
                className="mr-auto"
                onClick={async () => {
                  await deleteLead.mutateAsync(editing.id);
                  setDialogOpen(false);
                }}
              >
                Excluir
              </Button>
            )}
            {editing && canEdit && editing.stage !== 'lost' && (
              <Button
                variant="secondary"
                disabled={convertingId === editing.id}
                onClick={() => handleScheduleFromLead(editing)}
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                {editing.patientId ? 'Abrir na Agenda' : 'Criar paciente e agendar'}
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={
                !form.name.trim() ||
                !form.phone.trim() ||
                !form.lead_source ||
                createLead.isPending ||
                updateLead.isPending
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
