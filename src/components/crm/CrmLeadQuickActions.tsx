import { useState } from 'react';
import {
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  StickyNote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { CRM_STAGES, type CrmLead, type CrmLeadStage } from '@/types/crm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CONTACT_RESULTS = [
  { id: 'contacted', label: 'Contato realizado' },
  { id: 'no_answer', label: 'Não respondeu' },
  { id: 'invalid_number', label: 'Número inválido' },
  { id: 'callback', label: 'Retornar depois' },
  { id: 'interested', label: 'Interessado' },
  { id: 'not_interested', label: 'Não interessado' },
  { id: 'schedule_requested', label: 'Agendamento solicitado' },
] as const;

function digitsPhone(phone: string | null | undefined): string {
  return (phone || '').replace(/\D/g, '');
}

function buildWhatsAppUrl(
  phone: string,
  template: string,
  vars: Record<string, string>
): string {
  let text = template;
  for (const [key, value] of Object.entries(vars)) {
    text = text.split(`{${key}}`).join(value);
  }
  // Remove qualquer {token} restante não permitido
  text = text.replace(/\{[a-z_]+\}/gi, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

interface CrmLeadQuickActionsProps {
  lead: CrmLead;
  clinicName?: string;
  userName?: string;
  canEdit?: boolean;
  whatsappTemplate?: string;
  afterContactStage?: CrmLeadStage | null;
  onMoved?: (stage: CrmLeadStage) => void;
  onEdit?: () => void;
  className?: string;
}

export function CrmLeadQuickActions({
  lead,
  clinicName = 'clínica',
  userName = 'equipe',
  canEdit = false,
  whatsappTemplate =
    'Olá, {nome}! Sou {usuario} da {clinica}. Recebemos seu contato e gostaria de dar continuidade ao atendimento.',
  afterContactStage = 'contact',
  onMoved,
  onEdit,
  className,
}: CrmLeadQuickActionsProps) {
  const phone = digitsPhone(lead.phone);
  const [contactOpen, setContactOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<string>('contacted');
  const [moveTo, setMoveTo] = useState<string>('keep');
  const [saving, setSaving] = useState(false);

  const logActivity = async (
    activityType: string,
    description: string,
    resultValue?: string | null,
    metadata?: Record<string, unknown>
  ) => {
    const { error } = await supabase.rpc('add_crm_lead_activity' as never, {
      p_lead_id: lead.id,
      p_activity_type: activityType,
      p_description: description,
      p_result: resultValue ?? null,
      p_origin: 'crm',
      p_metadata: metadata || {},
    } as never);
    if (error && error.code !== 'PGRST202' && error.code !== '42883') {
      console.error(error);
    }
  };

  const openWhatsApp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!phone) {
      toast.error('Lead sem telefone válido.');
      return;
    }
    const url = buildWhatsAppUrl(phone, whatsappTemplate, {
      nome: lead.name || 'cliente',
      clinica: clinicName,
      usuario: userName,
      servico: lead.interest || '',
      origem: lead.leadSource || '',
    });
    window.open(url, '_blank', 'noopener,noreferrer');
    await logActivity('whatsapp_opened', `WhatsApp aberto para ${lead.name}`, null, {
      phone,
    });
    toast.success('WhatsApp aberto. Registre o contato após o atendimento.');
  };

  const callPhone = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!phone) return;
    window.location.href = `tel:${phone}`;
    await logActivity('call_started', `Ligação iniciada para ${lead.name}`);
  };

  const sendEmail = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!lead.email) {
      toast.error('Lead sem e-mail.');
      return;
    }
    window.location.href = `mailto:${lead.email}`;
    await logActivity('email_opened', `E-mail aberto para ${lead.name}`);
  };

  const saveContact = async () => {
    setSaving(true);
    try {
      await logActivity(
        'contact_registered',
        notes.trim() || 'Contato registrado',
        result,
        { move_to: moveTo }
      );

      if (moveTo !== 'keep' && onMoved) {
        onMoved(moveTo as CrmLeadStage);
      } else if (moveTo === 'mapped' && afterContactStage && onMoved) {
        onMoved(afterContactStage);
      }

      toast.success('Contato registrado.');
      setContactOpen(false);
      setNotes('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível registrar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {phone && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Abrir WhatsApp"
          onClick={openWhatsApp}
        >
          <MessageCircle className="h-4 w-4 text-emerald-600" />
        </Button>
      )}
      {phone && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Ligar"
          onClick={callPhone}
        >
          <Phone className="h-4 w-4" />
        </Button>
      )}
      {lead.email && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="hidden h-8 w-8 sm:inline-flex"
          aria-label="Enviar e-mail"
          onClick={sendEmail}
        >
          <Mail className="h-4 w-4" />
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Mais ações"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <DropdownMenuItem
              onClick={() => {
                setContactOpen(true);
              }}
            >
              <StickyNote className="mr-2 h-4 w-4" />
              Registrar contato
            </DropdownMenuItem>
          )}
          {onEdit && (
            <DropdownMenuItem onClick={onEdit}>Editar lead</DropdownMenuItem>
          )}
          {phone && (
            <DropdownMenuItem onClick={openWhatsApp}>Abrir WhatsApp</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent
          className="sm:max-w-md"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Registrar contato realizado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Resultado</Label>
              <Select value={result} onValueChange={setResult}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_RESULTS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Resumo do contato (opcional)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mover card</Label>
              <Select value={moveTo} onValueChange={setMoveTo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Manter na etapa atual</SelectItem>
                  {afterContactStage && (
                    <SelectItem value={afterContactStage}>
                      Mover para etapa de contato (
                      {CRM_STAGES.find((s) => s.id === afterContactStage)?.label})
                    </SelectItem>
                  )}
                  {CRM_STAGES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Mover para {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void saveContact()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
