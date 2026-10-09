import { Check, CheckCircle, Clock, Edit, MessageSquare, MoreVertical, Trash2, User, UserX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AgendaEntry } from '@/types/scheduling';
import { PAYMENT_CONFIG, STATUS_CONFIG } from './agendaStatus';

export interface AppointmentActions {
  onEdit: (appointment: AgendaEntry) => void;
  onConfirm: (appointment: AgendaEntry) => void;
  onComplete: (appointment: AgendaEntry) => void;
  onMarkNoShow: (appointment: AgendaEntry) => void;
  onCancel: (appointment: AgendaEntry) => void;
  onDelete: (appointment: AgendaEntry) => void;
  onWhatsApp: (appointment: AgendaEntry) => void;
}

interface AppointmentCardProps extends AppointmentActions {
  appointment: AgendaEntry;
  compact?: boolean;
}

function AppointmentActionsMenu({
  appointment,
  onEdit,
  onConfirm,
  onComplete,
  onMarkNoShow,
  onCancel,
  onDelete,
  onWhatsApp,
  triggerClassName,
  iconClassName,
}: AppointmentCardProps & { triggerClassName?: string; iconClassName?: string }) {
  const isOpen = appointment.status === 'pending' || appointment.status === 'confirmed' || appointment.status === 'return';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={triggerClassName ?? 'h-8 w-8'}
          onClick={(e) => e.stopPropagation()}
          aria-label="Ações do agendamento"
        >
          <MoreVertical className={iconClassName ?? 'h-4 w-4'} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => onWhatsApp(appointment)}>
          <MessageSquare className="mr-2 h-4 w-4" />
          Enviar WhatsApp
        </DropdownMenuItem>
        {appointment.status === 'pending' && (
          <DropdownMenuItem onClick={() => onConfirm(appointment)}>
            <Check className="mr-2 h-4 w-4" />
            Confirmar
          </DropdownMenuItem>
        )}
        {isOpen && (
          <DropdownMenuItem
            onClick={() => onComplete(appointment)}
            className="text-emerald-600 focus:text-emerald-600"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Finalizar atendimento
          </DropdownMenuItem>
        )}
        {isOpen && (
          <DropdownMenuItem
            onClick={() => onMarkNoShow(appointment)}
            className="text-orange-600 focus:text-orange-600"
          >
            <UserX className="mr-2 h-4 w-4" />
            Marcar como faltou
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onEdit(appointment)}>
          <Edit className="mr-2 h-4 w-4" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isOpen ? (
          <DropdownMenuItem
            onClick={() => onCancel(appointment)}
            className="text-destructive focus:text-destructive"
          >
            <X className="mr-2 h-4 w-4" />
            Cancelar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() => onDelete(appointment)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppointmentCard(props: AppointmentCardProps) {
  const { appointment, compact = false, onEdit } = props;
  const status = STATUS_CONFIG[appointment.status];
  const payment = PAYMENT_CONFIG[appointment.paymentStatus] ?? PAYMENT_CONFIG.pending;

  if (compact) {
    return (
      <div
        className={cn(
          'group relative mb-1 flex cursor-pointer items-start gap-1 rounded-md border-l-4 px-2 py-1 text-xs transition-all hover:shadow-md',
          status.bg,
          status.border,
        )}
        title={`${appointment.startTime} · ${appointment.patientName} - ${appointment.procedure}`}
        onClick={() => onEdit(appointment)}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {appointment.startTime} {appointment.patientName}
          </div>
          <div className="truncate text-muted-foreground">{appointment.procedure}</div>
        </div>
        <AppointmentActionsMenu
          {...props}
          triggerClassName="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          iconClassName="h-3 w-3"
        />
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border-l-4 bg-card p-4 shadow-sm transition-all hover:shadow-md', status.border)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-foreground">{appointment.patientName}</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                status.bg,
                status.text,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
              {status.label}
            </span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', payment.className)}>
              {payment.label}
            </span>
          </div>

          <p className="mt-1 text-sm text-foreground">{appointment.procedure}</p>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {appointment.startTime} - {appointment.endTime}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {appointment.professionalName}
            </span>
          </div>
        </div>

        <AppointmentActionsMenu {...props} />
      </div>
    </div>
  );
}
