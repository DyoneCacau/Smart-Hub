import { useEffect, useMemo, useState } from 'react';
import { Plus, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { formatCPF, formatPhone, isValidCPF } from '@/lib/patientFormat';
import type { Patient, PatientInput, PatientStatus } from '@/types/scheduling';

const EMPTY_FORM: PatientInput = {
  name: '',
  cpf: null,
  phone: '',
  email: null,
  birth_date: null,
  address: null,
  insurance: null,
  clinical_notes: null,
  allergies: [],
  status: 'active',
};

interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: Patient | null;
  existingPatients: Patient[];
  onSave: (data: PatientInput, id?: string) => void;
}

export function PatientFormDialog({ open, onOpenChange, patient, existingPatients, onSave }: PatientFormDialogProps) {
  const { segment } = useClinicSettings();
  const [form, setForm] = useState<PatientInput>(EMPTY_FORM);
  const [newAllergy, setNewAllergy] = useState('');

  const insuranceOptions = useMemo(
    () =>
      Array.from(new Set(existingPatients.map((p) => p.insurance?.trim()).filter((i): i is string => !!i))).sort(),
    [existingPatients],
  );

  useEffect(() => {
    if (!open) return;
    if (patient) {
      const { id: _id, created_at: _createdAt, ...rest } = patient;
      setForm(rest);
    } else {
      setForm(EMPTY_FORM);
    }
    setNewAllergy('');
  }, [open, patient]);

  const addAllergy = () => {
    const allergy = newAllergy.trim();
    if (allergy && !form.allergies.includes(allergy)) {
      setForm({ ...form, allergies: [...form.allergies, allergy] });
    }
    setNewAllergy('');
  };

  const removeAllergy = (allergy: string) => {
    setForm({ ...form, allergies: form.allergies.filter((a) => a !== allergy) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cpf = form.cpf?.trim() || null;

    if (!form.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (form.phone.replace(/\D/g, '').length < 10) {
      toast.error('Informe um telefone com DDD');
      return;
    }
    if (cpf && !isValidCPF(cpf)) {
      toast.error('CPF inválido. Verifique o número informado.');
      return;
    }
    if (cpf && existingPatients.some((p) => p.id !== patient?.id && p.cpf === cpf)) {
      toast.error('Já existe um paciente cadastrado com este CPF');
      return;
    }

    onSave(
      {
        ...form,
        name: form.name.trim(),
        cpf,
        phone: form.phone.trim(),
        email: form.email?.trim() || null,
        birth_date: form.birth_date || null,
        address: form.address?.trim() || null,
        insurance: form.insurance?.trim() || null,
        clinical_notes: form.clinical_notes?.trim() || null,
      },
      patient?.id,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-primary" />
            {patient ? 'Editar paciente' : 'Novo paciente'}
          </DialogTitle>
          <DialogDescription>
            {patient ? 'Atualize os dados do paciente' : `Cadastre um novo paciente ${segment.establishmentOf}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="patient-name">Nome completo *</Label>
              <Input
                id="patient-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome completo do paciente"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-phone">Telefone / WhatsApp *</Label>
              <Input
                id="patient-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
                placeholder="(11) 99999-9999"
                inputMode="tel"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-cpf">CPF</Label>
              <Input
                id="patient-cpf"
                value={form.cpf ?? ''}
                onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-email">E-mail</Label>
              <Input
                id="patient-email"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-birth-date">Data de nascimento</Label>
              <DateInput
                id="patient-birth-date"
                value={form.birth_date ?? ''}
                onChange={(v) => setForm({ ...form, birth_date: v })}
                showCalendar
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="patient-address">Endereço</Label>
              <Input
                id="patient-address"
                value={form.address ?? ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Rua, número, bairro, cidade - UF"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-insurance">Convênio</Label>
              <Input
                id="patient-insurance"
                list="patient-insurances"
                value={form.insurance ?? ''}
                onChange={(e) => setForm({ ...form, insurance: e.target.value })}
                placeholder="Particular ou nome do convênio"
              />
              <datalist id="patient-insurances">
                {Array.from(new Set(['Particular', ...insuranceOptions])).map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as PatientStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="patient-allergy">Alergias</Label>
            <div className="flex gap-2">
              <Input
                id="patient-allergy"
                value={newAllergy}
                onChange={(e) => setNewAllergy(e.target.value)}
                placeholder="Digite uma alergia e pressione Enter"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAllergy();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addAllergy} aria-label="Adicionar alergia">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {form.allergies.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {form.allergies.map((allergy) => (
                  <Badge key={allergy} variant="destructive" className="gap-1">
                    {allergy}
                    <button type="button" onClick={() => removeAllergy(allergy)} aria-label={`Remover ${allergy}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="patient-notes">Observações clínicas</Label>
            <Textarea
              id="patient-notes"
              value={form.clinical_notes ?? ''}
              onChange={(e) => setForm({ ...form, clinical_notes: e.target.value })}
              placeholder="Informações clínicas relevantes sobre o paciente..."
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">{patient ? 'Salvar alterações' : 'Cadastrar paciente'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
