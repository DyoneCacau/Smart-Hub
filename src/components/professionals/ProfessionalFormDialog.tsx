import { useEffect, useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { PROFESSIONAL_COUNCILS } from '@/lib/healthSegments';
import type { Professional, ProfessionalInput } from '@/types/scheduling';

const NO_COUNCIL = '__none__';

const today = () => new Date().toISOString().split('T')[0];

const EMPTY_FORM: ProfessionalInput = {
  name: '',
  specialty: '',
  council: null,
  registration: null,
  email: null,
  phone: null,
  is_active: true,
  hire_date: null,
};

interface ProfessionalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professional?: Professional | null;
  onSave: (data: ProfessionalInput, id?: string) => void;
}

export function ProfessionalFormDialog({ open, onOpenChange, professional, onSave }: ProfessionalFormDialogProps) {
  const { segment } = useClinicSettings();
  const [form, setForm] = useState<ProfessionalInput>(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    if (professional) {
      const { id: _id, ...rest } = professional;
      setForm(rest);
    } else {
      setForm({ ...EMPTY_FORM, council: segment.defaultCouncil, hire_date: today() });
    }
  }, [open, professional, segment.defaultCouncil]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.specialty.trim()) {
      toast.error('Preencha nome e especialidade / função');
      return;
    }
    if (form.council && !form.registration?.trim()) {
      toast.error(`Informe o número do ${form.council} ou selecione "Sem registro"`);
      return;
    }
    onSave(
      {
        ...form,
        name: form.name.trim(),
        specialty: form.specialty.trim(),
        registration: form.council ? form.registration?.trim() || null : null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        hire_date: form.hire_date || null,
      },
      professional?.id,
    );
    onOpenChange(false);
  };

  const councilOptions =
    form.council && !PROFESSIONAL_COUNCILS.some((c) => c.value === form.council)
      ? [...PROFESSIONAL_COUNCILS, { value: form.council, label: form.council }]
      : PROFESSIONAL_COUNCILS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            {professional ? 'Editar profissional' : 'Novo profissional'}
          </DialogTitle>
          <DialogDescription>
            {professional
              ? 'Atualize os dados do profissional'
              : `Cadastre um novo profissional ${segment.establishmentOf}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="professional-name">Nome completo *</Label>
            <Input
              id="professional-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Dr. João Silva"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="professional-specialty">Especialidade / função *</Label>
            <Input
              id="professional-specialty"
              list="professional-specialties"
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              placeholder={`Ex.: ${segment.specialties[0]}`}
            />
            <datalist id="professional-specialties">
              {segment.specialties.map((spec) => (
                <option key={spec} value={spec} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Conselho</Label>
              <Select
                value={form.council ?? NO_COUNCIL}
                onValueChange={(v) => setForm({ ...form, council: v === NO_COUNCIL ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COUNCIL}>Sem registro</SelectItem>
                  {councilOptions.map((council) => (
                    <SelectItem key={council.value} value={council.value}>
                      {council.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="professional-registration">Número do registro{form.council ? ' *' : ''}</Label>
              <Input
                id="professional-registration"
                value={form.registration ?? ''}
                onChange={(e) => setForm({ ...form, registration: e.target.value })}
                placeholder={form.council ? '12345-SP' : 'Não se aplica'}
                disabled={!form.council}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="professional-email">E-mail</Label>
            <Input
              id="professional-email"
              type="email"
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="profissional@email.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="professional-phone">Telefone</Label>
              <Input
                id="professional-phone"
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="professional-hire-date">Data de contratação</Label>
              <DateInput
                id="professional-hire-date"
                value={form.hire_date ?? ''}
                onChange={(v) => setForm({ ...form, hire_date: v })}
                showCalendar
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="professional-active">Profissional ativo</Label>
            <Switch
              id="professional-active"
              checked={form.is_active}
              onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">{professional ? 'Salvar alterações' : 'Cadastrar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
