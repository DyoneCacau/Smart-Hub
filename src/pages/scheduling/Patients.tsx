import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  AlertCircle,
  Calendar,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { PatientDetailsDialog } from '@/components/patients/PatientDetailsDialog';
import { PatientFormDialog } from '@/components/patients/PatientFormDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { useAppointments, usePatients, useProfessionals } from '@/hooks/useScheduling';
import { patientAge, patientInitials, whatsappLink } from '@/lib/patientFormat';
import { cn } from '@/lib/utils';
import type { AgendaEntry, Appointment, Patient, PatientInput } from '@/types/scheduling';

/** Agendamentos antigos, criados sem vínculo, são associados pelo nome. */
function belongsTo(appointment: Appointment, patient: Patient): boolean {
  if (appointment.patientId) return appointment.patientId === patient.id;
  return appointment.patientName.trim().toLowerCase() === patient.name.trim().toLowerCase();
}

export default function Patients() {
  const { patients, createPatient, updatePatient, removePatient } = usePatients();
  const { appointments } = useAppointments();
  const { professionals } = useProfessionals();
  const { segment } = useClinicSettings();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);

  const selected = patients.find((p) => p.id === selectedId) ?? null;

  const entries: AgendaEntry[] = useMemo(() => {
    const names = new Map(professionals.map((p) => [p.id, p.name]));
    return appointments.map((apt) => ({
      ...apt,
      professionalName: names.get(apt.professionalId) ?? 'Profissional removido',
    }));
  }, [appointments, professionals]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return patients.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!term) return true;
      if (`${p.name} ${p.email ?? ''} ${p.insurance ?? ''}`.toLowerCase().includes(term)) return true;
      return (
        digits.length > 0 &&
        (p.phone.replace(/\D/g, '').includes(digits) || (p.cpf ?? '').replace(/\D/g, '').includes(digits))
      );
    });
  }, [patients, search, statusFilter]);

  const thisMonth = format(new Date(), 'yyyy-MM');
  const stats = [
    { label: 'Total', value: patients.length, icon: Users, color: 'bg-blue-100 text-blue-600', valueClass: '' },
    {
      label: 'Ativos',
      value: patients.filter((p) => p.status === 'active').length,
      icon: UserCheck,
      color: 'bg-emerald-100 text-emerald-600',
      valueClass: 'text-emerald-600',
    },
    {
      label: 'Inativos',
      value: patients.filter((p) => p.status === 'inactive').length,
      icon: UserX,
      color: 'bg-red-100 text-red-600',
      valueClass: 'text-red-600',
    },
    {
      label: 'Novos no mês',
      value: patients.filter((p) => p.created_at.startsWith(thisMonth)).length,
      icon: UserPlus,
      color: 'bg-purple-100 text-purple-600',
      valueClass: '',
    },
  ];

  const handleSave = (data: PatientInput, id?: string) => {
    if (id) {
      updatePatient(id, data);
      toast.success('Paciente atualizado com sucesso!');
    } else {
      createPatient(data);
      toast.success('Paciente cadastrado com sucesso!');
    }
  };

  const handleToggleStatus = (patient: Patient) => {
    const next = patient.status === 'active' ? 'inactive' : 'active';
    updatePatient(patient.id, { status: next });
    toast.success(`Paciente ${next === 'active' ? 'ativado' : 'desativado'} com sucesso!`);
  };

  const handleDelete = (patient: Patient) => {
    const linked = appointments.filter((a) => belongsTo(a, patient)).length;
    if (linked > 0) {
      toast.error(`Este paciente tem ${linked} agendamento(s). Desative em vez de excluir.`);
      return;
    }
    removePatient(patient.id);
    toast.success('Paciente excluído');
    setSelectedId(null);
  };

  const handleWhatsApp = (patient: Patient) => {
    const url = whatsappLink(patient.phone, `Olá, ${patient.name}!`);
    if (!url) {
      toast.error('Paciente sem telefone válido cadastrado');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openForm = (patient: Patient | null) => {
    setEditing(patient);
    setSelectedId(null);
    setFormOpen(true);
  };

  return (
    <AppLayout
      title="Pacientes"
      description={`Gerencie os pacientes ${segment.establishmentOf}`}
      actions={
        <Button onClick={() => openForm(null)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo paciente
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, color, valueClass }) => (
            <Card key={label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, CPF, telefone, e-mail ou convênio..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {patients.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Mostrando {filtered.length} de {patients.length} pacientes
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((patient) => {
            const age = patientAge(patient.birth_date);
            const lastVisit = entries
              .filter((a) => belongsTo(a, patient) && a.status === 'completed')
              .reduce<string | null>((latest, a) => (!latest || a.date > latest ? a.date : latest), null);

            return (
              <Card
                key={patient.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md',
                  patient.status === 'inactive' && 'opacity-60',
                )}
                onClick={() => setSelectedId(patient.id)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                      {patientInitials(patient.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold">{patient.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {age !== null ? `${age} anos` : 'Idade não informada'}
                          </p>
                        </div>
                        <Badge variant={patient.status === 'active' ? 'default' : 'secondary'}>
                          {patient.status === 'active' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                        <p className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5" />
                          {patient.phone}
                        </p>
                        {patient.email && (
                          <p className="flex items-center gap-2 truncate">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            {patient.email}
                          </p>
                        )}
                        {patient.insurance && (
                          <p className="flex items-center gap-2">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {patient.insurance}
                          </p>
                        )}
                        <p className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5" />
                          Última visita: {lastVisit ? format(parseISO(lastVisit), 'dd/MM/yyyy') : '-'}
                        </p>
                        {patient.allergies.length > 0 && (
                          <p className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">Alergias: {patient.allergies.join(', ')}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed py-12 text-center text-muted-foreground">
              {patients.length === 0
                ? 'Nenhum paciente cadastrado ainda. Clique em "Novo paciente" para começar.'
                : 'Nenhum paciente encontrado'}
            </div>
          )}
        </div>
      </div>

      <PatientDetailsDialog
        patient={selected}
        appointments={selected ? entries.filter((a) => belongsTo(a, selected)) : []}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onEdit={openForm}
        onToggleStatus={handleToggleStatus}
        onDelete={handleDelete}
        onWhatsApp={handleWhatsApp}
      />

      <PatientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        patient={editing}
        existingPatients={patients}
        onSave={handleSave}
      />
    </AppLayout>
  );
}
