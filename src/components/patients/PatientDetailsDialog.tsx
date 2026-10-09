import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertCircle,
  Calendar,
  Edit,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import { STATUS_CONFIG } from '@/components/agenda/agendaStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { patientAge, patientInitials } from '@/lib/patientFormat';
import { cn } from '@/lib/utils';
import type { AgendaEntry, Patient } from '@/types/scheduling';

interface PatientDetailsDialogProps {
  patient: Patient | null;
  appointments: AgendaEntry[];
  onOpenChange: (open: boolean) => void;
  onEdit: (patient: Patient) => void;
  onToggleStatus: (patient: Patient) => void;
  onDelete: (patient: Patient) => void;
  onWhatsApp: (patient: Patient) => void;
}

export function PatientDetailsDialog({
  patient,
  appointments,
  onOpenChange,
  onEdit,
  onToggleStatus,
  onDelete,
  onWhatsApp,
}: PatientDetailsDialogProps) {
  if (!patient) return null;

  const age = patientAge(patient.birth_date);
  const today = format(new Date(), 'yyyy-MM-dd');
  const history = [...appointments].sort((a, b) =>
    `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`),
  );
  const completed = appointments.filter((a) => a.status === 'completed').length;
  const upcoming = appointments.filter(
    (a) => a.date >= today && ['pending', 'confirmed', 'return'].includes(a.status),
  ).length;
  const missed = appointments.filter((a) => a.status === 'no_show').length;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex flex-wrap items-start gap-4 pr-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <span className="text-2xl font-bold text-primary">{patientInitials(patient.name)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="break-words text-xl leading-normal">{patient.name}</DialogTitle>
              <p className="text-muted-foreground">
                {[age !== null ? `${age} anos` : null, patient.cpf ? `CPF: ${patient.cpf}` : null]
                  .filter(Boolean)
                  .join(' · ') || 'Sem CPF e data de nascimento'}
              </p>
            </div>
            <Badge
              variant={patient.status === 'active' ? 'default' : 'secondary'}
              className={cn('shrink-0', patient.status === 'active' && 'bg-emerald-600 hover:bg-emerald-600/90')}
            >
              {patient.status === 'active' ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-1">
          <Tabs defaultValue="info" className="mt-2 space-y-4 pb-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="info">Informações</TabsTrigger>
              <TabsTrigger value="clinical">Dados clínicos</TabsTrigger>
              <TabsTrigger value="history">Histórico ({appointments.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="mt-0">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Contato</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {patient.phone}
                    </p>
                    <p className="flex items-center gap-3 break-all">
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {patient.email || 'Não informado'}
                    </p>
                    <p className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      {patient.address || 'Não informado'}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Dados pessoais</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      Nascimento:{' '}
                      {patient.birth_date
                        ? format(parseISO(patient.birth_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                        : 'Não informado'}
                    </p>
                    <p className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Idade: {age !== null ? `${age} anos` : '-'}
                    </p>
                    <p className="flex items-center gap-3">
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      Convênio: {patient.insurance || 'Não informado'}
                    </p>
                    <p className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      Cadastro: {format(parseISO(patient.created_at), 'dd/MM/yyyy')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Resumo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
                      {[
                        { label: 'Consultas', value: appointments.length, className: 'text-primary' },
                        { label: 'Realizadas', value: completed, className: 'text-emerald-600' },
                        { label: 'Agendadas', value: upcoming, className: 'text-amber-600' },
                        { label: 'Faltas', value: missed, className: 'text-orange-600' },
                      ].map(({ label, value, className }) => (
                        <div key={label} className="rounded-lg bg-muted/50 p-3">
                          <p className={cn('text-2xl font-bold', className)}>{value}</p>
                          <p className="text-sm text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="clinical" className="mt-0 space-y-4">
              {patient.allergies.length > 0 && (
                <Card className="border-destructive/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      Alergias
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {patient.allergies.map((allergy) => (
                      <Badge key={allergy} variant="destructive">
                        {allergy}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    Observações clínicas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm">
                    {patient.clinical_notes || 'Nenhuma observação clínica registrada.'}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-0">
              {history.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Calendar className="mx-auto mb-3 h-12 w-12 opacity-50" />
                  <p>Nenhuma consulta registrada</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((apt) => {
                    const status = STATUS_CONFIG[apt.status];
                    return (
                      <Card key={apt.id}>
                        <CardContent className="flex items-start justify-between gap-3 p-4">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{apt.procedure}</span>
                              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', status.chip)}>
                                {status.label}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{apt.professionalName}</p>
                            {apt.notes && (
                              <p className="mt-2 rounded bg-muted/50 p-2 text-sm text-muted-foreground">{apt.notes}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right text-sm">
                            <p className="font-medium">
                              {format(parseISO(apt.date), "dd 'de' MMM yyyy", { locale: ptBR })}
                            </p>
                            <p className="text-muted-foreground">
                              {apt.startTime} - {apt.endTime}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(patient)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onToggleStatus(patient)}>
              {patient.status === 'active' ? 'Desativar' : 'Ativar'}
            </Button>
            <Button variant="outline" onClick={() => onWhatsApp(patient)}>
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </Button>
            <Button onClick={() => onEdit(patient)}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
