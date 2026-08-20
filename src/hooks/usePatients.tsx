import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClinic } from './useClinic';
import { toast } from 'sonner';
import { useAuth } from './useAuth';

export interface PatientData {
  id: string;
  clinic_id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  birth_date: string | null;
  clinical_notes: string | null;
  allergies: string[];
  lead_source: string | null;
  referral_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Propaga o nome do paciente para os leads do CRM vinculados a ele
 * (crm_leads.patient_id). Silencioso: não deve quebrar a atualização do
 * paciente caso o módulo de CRM não esteja habilitado/instalado na clínica.
 */
async function syncNameToLinkedLeads(patientId: string, name: string) {
  const { error } = await supabase
    .from('crm_leads' as any)
    .update({ name, updated_at: new Date().toISOString() })
    .eq('patient_id', patientId);
  if (error && (error as { code?: string }).code !== '42P01') {
    console.error('Failed to sync patient name to linked CRM leads', error);
  }
}

/**
 * @param overrideClinicId Usa essa clinica no lugar da clinica ativa na sidebar.
 * Necessario em telas que editam registros de OUTRA clinica (ex.: editar um
 * agendamento de uma unidade diferente na Agenda com "Todas as clinicas"),
 * senao a lista de pacientes vem da clinica errada e o Select aparece vazio.
 */
export function usePatients(overrideClinicId?: string | null) {
  const { clinicId: activeClinicId } = useClinic();
  const clinicId = overrideClinicId || activeClinicId;

  const { data: patients, isLoading, error, refetch } = useQuery({
    queryKey: ['patients', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];

      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  return { 
    patients: patients || [], 
    isLoading, 
    error,
    refetch 
  };
}

export function usePatientMutations() {
  const queryClient = useQueryClient();
  const { clinicId } = useClinic();
  const { user } = useAuth();

  const createPatient = useMutation({
    mutationFn: async (data: Omit<PatientData, 'id' | 'clinic_id' | 'created_at' | 'updated_at'>) => {
      if (!clinicId) throw new Error('Clínica não encontrada');

      const patientId = crypto.randomUUID();
      const patientPayload = {
        id: patientId,
        ...data,
        clinic_id: clinicId,
      };

      const { error } = await supabase
        .from('patients')
        .insert(patientPayload);

      if (error) throw error;

      if (clinicId && user?.id) {
        const { error: eventError } = await supabase.from('audit_events').insert({
          clinic_id: clinicId,
          entity_type: 'patient',
          entity_id: patientId,
          action: 'create',
          before: null,
          after: patientPayload,
          reason: null,
          user_id: user.id,
        });

      if (eventError && (eventError as { code?: string }).code !== '42P01') {
        throw eventError;
      }
      }
      return patientPayload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast.success('Paciente cadastrado com sucesso!');
    },
    onError: (error: unknown) => {
      console.error('Error creating patient:', error);
      const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message: string }).message) : '';
      toast.error(msg ? `Erro ao cadastrar paciente: ${msg}` : 'Erro ao cadastrar paciente');
    },
  });

  const updatePatient = useMutation({
    mutationFn: async ({ id, ...data }: Partial<PatientData> & { id: string }) => {
      const { data: beforeData } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();

      const { data: patient, error } = await supabase
        .from('patients')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Sincroniza o nome de volta para o lead do CRM vinculado (se houver)
      if (data.name != null && data.name !== beforeData?.name) {
        await syncNameToLinkedLeads(id, data.name);
      }

      if (clinicId && user?.id) {
        const { error: eventError } = await supabase.from('audit_events').insert({
          clinic_id: clinicId,
          entity_type: 'patient',
          entity_id: id,
          action: 'update',
          before: beforeData || null,
          after: patient,
          reason: null,
          user_id: user.id,
        });

        if (eventError && (eventError as { code?: string }).code !== '42P01') {
          throw eventError;
        }
      }
      return patient;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast.success('Paciente atualizado com sucesso!');
    },
    onError: (error) => {
      console.error('Error updating patient:', error);
      toast.error('Erro ao atualizar paciente');
    },
  });

  const deletePatient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['audit-events'] });
      toast.success('Paciente removido com sucesso!');
    },
    onError: (error) => {
      console.error('Error deleting patient:', error);
      toast.error('Erro ao remover paciente');
    },
  });

  return { createPatient, updatePatient, deletePatient };
}
