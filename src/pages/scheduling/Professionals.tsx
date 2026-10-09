import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Award, Edit, Mail, Phone, Plus, Search, Stethoscope, Trash2, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProfessionalFormDialog } from '@/components/professionals/ProfessionalFormDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { professionalRegistration, useAppointments, useProfessionals } from '@/hooks/useScheduling';
import { cn } from '@/lib/utils';
import type { Professional, ProfessionalInput } from '@/types/scheduling';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground',
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}

export default function Professionals() {
  const { professionals, createProfessional, updateProfessional, removeProfessional } = useProfessionals();
  const { appointments } = useAppointments();
  const { segment } = useClinicSettings();
  const [search, setSearch] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Professional | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);

  const specialties = useMemo(
    () => Array.from(new Set(professionals.map((p) => p.specialty))).sort(),
    [professionals],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return professionals.filter((p) => {
      if (term && !`${p.name} ${p.specialty} ${professionalRegistration(p) ?? ''}`.toLowerCase().includes(term)) {
        return false;
      }
      if (specialtyFilter !== 'all' && p.specialty !== specialtyFilter) return false;
      if (statusFilter === 'active' && !p.is_active) return false;
      if (statusFilter === 'inactive' && p.is_active) return false;
      return true;
    });
  }, [professionals, search, specialtyFilter, statusFilter]);

  const stats = [
    { label: 'Total', value: professionals.length, icon: Stethoscope, color: 'bg-blue-100 text-blue-600', valueClass: '' },
    {
      label: 'Ativos',
      value: professionals.filter((p) => p.is_active).length,
      icon: UserCheck,
      color: 'bg-emerald-100 text-emerald-600',
      valueClass: 'text-emerald-600',
    },
    {
      label: 'Inativos',
      value: professionals.filter((p) => !p.is_active).length,
      icon: UserX,
      color: 'bg-red-100 text-red-600',
      valueClass: 'text-red-600',
    },
    { label: 'Especialidades', value: specialties.length, icon: Award, color: 'bg-purple-100 text-purple-600', valueClass: '' },
  ];

  const handleSave = (data: ProfessionalInput, id?: string) => {
    if (id) {
      updateProfessional(id, data);
      toast.success('Profissional atualizado com sucesso!');
    } else {
      createProfessional(data);
      toast.success('Profissional cadastrado com sucesso!');
    }
  };

  const handleToggleStatus = (professional: Professional) => {
    updateProfessional(professional.id, { is_active: !professional.is_active });
    toast.success(`Profissional ${professional.is_active ? 'desativado' : 'ativado'} com sucesso!`);
    setSelected(null);
  };

  const handleDelete = (professional: Professional) => {
    const linked = appointments.filter((a) => a.professionalId === professional.id).length;
    if (linked > 0) {
      toast.error(`Este profissional tem ${linked} agendamento(s). Desative em vez de excluir.`);
      return;
    }
    removeProfessional(professional.id);
    toast.success('Profissional excluído');
    setSelected(null);
  };

  const openForm = (professional: Professional | null) => {
    setEditing(professional);
    setSelected(null);
    setFormOpen(true);
  };

  return (
    <AppLayout
      title="Profissionais"
      description={`Gerencie os profissionais ${segment.establishmentOf}`}
      actions={
        <Button onClick={() => openForm(null)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo profissional
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
                  placeholder="Buscar por nome, especialidade ou registro..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue placeholder="Especialidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as especialidades</SelectItem>
                  {specialties.map((spec) => (
                    <SelectItem key={spec} value={spec}>
                      {spec}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((professional) => (
            <Card
              key={professional.id}
              className={cn('cursor-pointer transition-all hover:shadow-md', !professional.is_active && 'opacity-60')}
              onClick={() => setSelected(professional)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <InitialsAvatar name={professional.name} className="h-16 w-16 text-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{professional.name}</h3>
                        <p className="text-sm text-muted-foreground">{professional.specialty}</p>
                      </div>
                      <Badge variant={professional.is_active ? 'default' : 'secondary'}>
                        {professional.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      {professionalRegistration(professional) && (
                        <p className="flex items-center gap-2">
                          <Award className="h-3.5 w-3.5" />
                          {professionalRegistration(professional)}
                        </p>
                      )}
                      {professional.phone && (
                        <p className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5" />
                          {professional.phone}
                        </p>
                      )}
                      {professional.email && (
                        <p className="flex items-center gap-2 truncate">
                          <Mail className="h-3.5 w-3.5" />
                          {professional.email}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed py-12 text-center text-muted-foreground">
              {professionals.length === 0
                ? 'Nenhum profissional cadastrado ainda. Clique em "Novo profissional" para começar.'
                : 'Nenhum profissional encontrado'}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              Detalhes do profissional
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <InitialsAvatar name={selected.name} className="h-20 w-20 text-xl" />
                <div>
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <p className="text-muted-foreground">{selected.specialty}</p>
                  <Badge variant={selected.is_active ? 'default' : 'secondary'} className="mt-1">
                    {selected.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Registro profissional</Label>
                  <p className="font-medium">{professionalRegistration(selected) ?? 'Sem registro'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data de contratação</Label>
                  <p className="font-medium">
                    {selected.hire_date ? format(parseISO(selected.hire_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Telefone</Label>
                  <p className="font-medium">{selected.phone || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">E-mail</Label>
                  <p className="break-all font-medium">{selected.email || '-'}</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => selected && handleDelete(selected)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => selected && handleToggleStatus(selected)}>
                {selected?.is_active ? 'Desativar' : 'Ativar'}
              </Button>
              <Button onClick={() => selected && openForm(selected)}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProfessionalFormDialog open={formOpen} onOpenChange={setFormOpen} professional={editing} onSave={handleSave} />
    </AppLayout>
  );
}
